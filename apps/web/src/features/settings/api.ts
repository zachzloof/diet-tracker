import type {
  ChangePasswordRequest,
  DeleteAccountRequest,
  ExportFormat,
} from '@diet-tracker/shared'
import { requestVoid } from '@/lib/api'

export const accountApi = {
  changePassword(input: ChangePasswordRequest): Promise<void> {
    return requestVoid('/account/password', { method: 'POST', body: input })
  },
  deleteAccount(input: DeleteAccountRequest): Promise<void> {
    return requestVoid('/account', { method: 'DELETE', body: input })
  },
  /** Downloads go through the browser (same-origin cookie), so a phone saves them to Files. */
  exportUrl(format: ExportFormat): string {
    return `/api/v1/account/export/${format}`
  },
}
