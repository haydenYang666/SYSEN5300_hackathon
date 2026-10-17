// Data origin is separate from whether the API uses the real statistical core.
export const UNKNOWN_SOURCE = { kind: 'user_upload', label: 'User upload (origin unverified)' }

export function provenanceText(provenance) {
  const labels = {
    synthetic: 'Synthetic example',
    public_historical: 'Public historical data',
    user_upload: 'User upload (origin unverified)',
    mixed: 'Edited / mixed records (origin unverified)',
    mock: 'Synthetic mock fixture',
  }
  const label = labels[provenance?.kind] ?? labels.user_upload
  return provenance?.imported ? `${label} · origin declared by imported snapshot, unverified` : label
}
