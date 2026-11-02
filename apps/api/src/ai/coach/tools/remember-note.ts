import { coachToolArgsSchemas, type NoteCard } from '@diet-tracker/shared'
import { v7 as uuidv7 } from 'uuid'
import { defineTool, type DraftResult } from './types.js'

/** A line to remember, as a card; nothing is kept until the person confirms it. */
export const rememberNote = defineTool({
  name: 'remember_note',
  description:
    'Draft a note to remember about the person ("left knee sore since Tuesday", "prefers training in the morning") as a card they confirm with a tap. Confirmed notes appear in every later briefing. Nothing is kept by this call. Use when they ask you to remember, note or keep in mind something that is not already in their profile.',
  schema: coachToolArgsSchemas.remember_note,
  status: () => 'Drafting a note to remember',
  async run(_ctx, args): Promise<DraftResult> {
    const text = args.text.replace(/\s+/g, ' ').trim()
    const card: NoteCard = { id: uuidv7(), kind: 'note', state: 'drafted', text }
    return {
      card,
      summary: {
        card: 'note',
        shows: 'a note card the person confirms with "Remember"; it is not kept until they tap it',
        text,
      },
    }
  },
})
