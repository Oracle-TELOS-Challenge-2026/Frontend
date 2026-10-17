import { BackendApiError, mutateBackendApi } from './backend-api.ts'

export async function updateDisplayName(displayName: string, expectedVersion: number) {
  const name = displayName.trim()
  if (!name || [...name].length > 30) throw new Error('이름은 1~30자로 입력해 주세요.')
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new Error('계정 정보를 다시 조회해 주세요.')
  const { data } = await mutateBackendApi('/api/v1/users/me', { method: 'PATCH', body: { displayName: name, expectedVersion } })
  if (data?.displayName !== name || !Number.isSafeInteger(data.version) || Number(data.version) <= expectedVersion) throw new BackendApiError(200, 'INVALID_RESPONSE', '변경 결과를 확인하지 못했어요. 계정 정보를 다시 조회해 주세요.')
}

export async function saveUserLocation(position: Pick<GeolocationPosition, 'coords' | 'timestamp'>, signal?: AbortSignal) {
  const { latitude, longitude, accuracy } = position.coords
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180 || !Number.isFinite(accuracy) || accuracy < 0 || Math.ceil(accuracy) > 2147483647 || !Number.isFinite(position.timestamp)) throw new Error('현재 위치를 확인하지 못했어요.')
  const observedAt = new Date(position.timestamp).toISOString()
  const { data } = await mutateBackendApi('/api/v1/users/me/location', { method: 'PUT', signal, body: { latitude, longitude, accuracyMeters: Math.ceil(accuracy), source: 'DEVICE', observedAt } })
  // 서버 좌표는 소수점 여섯 자리로 저장한다.
  if (typeof data?.latitude !== 'number' || !Number.isFinite(data.latitude) || Math.abs(data.latitude - latitude) > 0.000001 || typeof data.longitude !== 'number' || !Number.isFinite(data.longitude) || Math.abs(data.longitude - longitude) > 0.000001 || typeof data.savedAt !== 'string' || !Number.isFinite(Date.parse(data.savedAt))) throw new BackendApiError(200, 'INVALID_RESPONSE', '위치 저장 결과를 확인하지 못했어요. 다시 조회해 주세요.')
  return { latitude: data.latitude, longitude: data.longitude, savedAt: data.savedAt }
}

export async function deleteUserLocation() {
  const { status } = await mutateBackendApi('/api/v1/users/me/location', { method: 'DELETE' })
  if (status !== 204) throw new BackendApiError(status, 'INVALID_RESPONSE', '위치 삭제 결과를 확인하지 못했어요.')
}
