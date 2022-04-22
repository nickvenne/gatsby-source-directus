export const CODES = {
  /* Fetch errors */
  SelfSignedCertificate: `111002`,
  SyncError: `111003`,
  FetchContentTypes: `111004`,
  GatsbyPluginMissing: `111005`,
}

export const ERROR_MAP = {
  [CODES.SelfSignedCertificate]: {
    text: context => context.sourceMessage,
    level: `ERROR`,
    category: `USER`,
  },
  [CODES.SyncError]: {
    text: context => context.sourceMessage,
    level: `ERROR`,
    category: `THIRD_PARTY`,
  },
  [CODES.FetchContentTypes]: {
    text: context => context.sourceMessage,
    level: `ERROR`,
    category: `THIRD_PARTY`,
  },
  [CODES.GatsbyPluginMissing]: {
    text: context => context.sourceMessage,
    level: `ERROR`,
    category: `USER`,
  },
}