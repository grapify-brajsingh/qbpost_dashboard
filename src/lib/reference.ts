// The API's reference rule (`DirectRequestReader.ReferencePattern`): the reference becomes a QuickBooks batch id and
// part of a URL. The API refuses the statement at validate and post time, so keep this in step with it.
const REFERENCE_RE = /^[A-Za-z0-9._-]{1,64}$/

export const REFERENCE_RULE = "Use only letters, digits, '.', '_' and '-' (1 to 64 characters)"

export const isValidReference = (text: string) => REFERENCE_RE.test(text)
