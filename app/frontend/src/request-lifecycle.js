import { parseAnalysisSession } from './analysis-session.js'
import { UNKNOWN_SOURCE } from './provenance.js'

// One operation spans every await, including example/file reads and analysis.
// Aborting saves work; the generation guard also handles non-abortable File.text
// and transports that finish after cancellation.
export function createRequestLifecycle({
  analyze, parseIncidents, fetchExample = (...args) => fetch(...args),
  onBusy, onErrors, onDataset, onResult, onNavigate,
}) {
  let generation = 0
  let controller = null

  function invalidate() {
    generation += 1
    controller?.abort()
    controller = null
  }

  function begin() {
    invalidate()
    const id = generation
    const next = new AbortController()
    controller = next
    onErrors([])
    onBusy(true)
    return { signal: next.signal, isCurrent: () => id === generation && !next.signal.aborted }
  }

  function finish(operation) {
    if (!operation.isCurrent()) return
    controller = null
    onBusy(false)
  }

  async function analyzeCurrent(operation, { buildRequest, serverClock, mockScenario, commitResult = onResult, preserveResultOnError = false }, ctx) {
    let req
    try {
      req = buildRequest(ctx)
    } catch (error) {
      if (operation.isCurrent()) onErrors(Array.isArray(error) ? error : [error.message])
      return false
    }
    try {
      const res = await analyze(req, mockScenario, { signal: operation.signal })
      if (!operation.isCurrent()) return false
      commitResult({ res, serverClock: serverClock ?? !req.as_of })
      return true
    } catch (error) {
      if (!operation.isCurrent()) return false
      if (!preserveResultOnError) onResult(null)
      const head = error.status === 422 ? 'The API rejected the request (HTTP 422).'
        : error.status === 503 ? 'The analysis service is not available yet (HTTP 503).'
        : 'Analysis failed.'
      onErrors([head, error.message, ...(error.fields?.length ? [`Field(s): ${error.fields.join(', ')}`] : [])])
      return false
    }
  }

  return {
    async runAnalysis(options) {
      const operation = begin()
      try {
        return await analyzeCurrent(operation, options)
      } finally {
        finish(operation)
      }
    },

    async loadExample({ example, buildRequest, mockScenario, openDashboard = false }) {
      const operation = begin()
      try {
        const response = await fetchExample(example.url, { signal: operation.signal })
        if (!operation.isCurrent()) return false
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const text = await response.text()
        if (!operation.isCurrent()) return false
        const records = parseIncidents(text)
        onDataset({ records, source: example.file, settings: example.settings,
          provenance: example.provenance ?? UNKNOWN_SOURCE })
        const ok = await analyzeCurrent(operation, { buildRequest, mockScenario }, { records, settings: example.settings })
        if (ok && operation.isCurrent() && openDashboard) onNavigate(operation)
        return ok
      } catch (error) {
        if (operation.isCurrent()) onErrors([`Could not load the example ${example.file}: ${error.message}`])
        return false
      } finally {
        finish(operation)
      }
    },

    async importFile(file, options = {}) {
      if (!file) return false
      const operation = begin()
      try {
        const text = await file.text()
        if (!operation.isCurrent()) return false
        if (/\.json$/i.test(file.name)) {
          const session = parseAnalysisSession(text)
          if (!options.buildRequest) throw new Error('Analysis snapshot import requires the analysis service.')
          return await analyzeCurrent(operation, {
            buildRequest: () => options.buildRequest(session),
            serverClock: false, mockScenario: options.mockScenario,
            preserveResultOnError: true,
            commitResult: (result) => { onDataset(session); onResult(result) },
          })
        }
        const records = parseIncidents(text)
        onDataset({ records, source: file.name, provenance: UNKNOWN_SOURCE })
        return true
      } catch (error) {
        if (operation.isCurrent()) onErrors([`${file.name}: ${error.message}`])
        return false
      } finally {
        finish(operation)
      }
    },

    cancel() {
      invalidate()
      onBusy(false)
      onErrors([])
    },

    // Silent on unmount; a StrictMode setup can safely start another operation.
    dispose: invalidate,
  }
}
