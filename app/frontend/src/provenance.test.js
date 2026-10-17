import { describe, expect, it } from 'vitest'
import { provenanceText } from './provenance.js'

describe('data provenance is explicit and never inferred from a filename', () => {
  it('keeps synthetic, historical and user-origin data distinct', () => {
    expect(provenanceText({ kind: 'synthetic' })).toBe('Synthetic example')
    expect(provenanceText({ kind: 'public_historical' })).toBe('Public historical data')
    expect(provenanceText({ label: 'real_patient_data.csv' })).toBe('User upload (origin unverified)')
    expect(provenanceText({ kind: 'mixed' })).toContain('origin unverified')
  })
  it('does not certify a provenance claim made in an uploaded JSON file', () => {
    expect(provenanceText({ kind: 'public_historical', imported: true })).toContain('declared by imported snapshot, unverified')
  })
})
