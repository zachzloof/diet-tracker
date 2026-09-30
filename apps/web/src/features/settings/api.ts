import type {
  ChangePasswordRequest,
  DeleteAccountRequest,
  ExportFormat,
} from '@diet-tracker/shared'
import { requestFile, requestVoid } from '@/lib/api'
import { saveSessionToken } from '@/lib/session-token'

export const accountApi = {
  changePassword(input: ChangePasswordRequest): Promise<void> {
    return requestVoid('/account/password', { method: 'POST', body: input })
  },
  async deleteAccount(input: DeleteAccountRequest): Promise<void> {
    await requestVoid('/account', { method: 'DELETE', body: input })
    await saveSessionToken(null)
  },
  /** Downloads go through the browser (same-origin cookie), so a phone saves them to Files. */
  exportUrl(format: ExportFormat): string {
    return `/api/v1/account/export/${format}`
  },
  /**
   * The native shells have no download manager and no cookie: fetch the file with the
   * bearer token, write it to the cache and hand it to the share sheet (Save to Files,
   * AirDrop, Mail). Resolves when the sheet closes; a cancelled sheet is not an error.
   */
  async shareExport(format: ExportFormat): Promise<void> {
    const { text, filename } = await requestFile(`/account/export/${format}`)
    const [{ Directory, Encoding, Filesystem }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ])
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    })
    await Share.share({ title: filename, files: [uri] }).catch(() => undefined)
  },
}
