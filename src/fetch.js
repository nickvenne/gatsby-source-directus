import { CODES } from "./report"
import SyncClient from "./sync-client"


export async function fetchContent({ syncToken, contentTypes, pluginOptions, reporter }) {

  const pageLimit = pluginOptions.pageLimit

  const syncProgress = reporter.createProgress(
    `Directus: ${syncToken ? `Sync changed items` : `Sync all items`}`,
    pageLimit,
    0
  )
  syncProgress.start()
  const syncClient = new SyncClient(pluginOptions, contentTypes, reporter, syncProgress)

  let currentSyncData
  let currentPageLimit = pageLimit
  let lastCurrentPageLimit
  let syncSuccess = false

  try {
    while(!syncSuccess) {
      try { 
        const baseSyncConfig = {
          limit: currentPageLimit
        }
        const query = syncToken
          ? { nextSyncToken: syncToken, initial: false, ...baseSyncConfig }
          : { initial: true, ...baseSyncConfig }

        currentSyncData = await syncClient.sync(query)
        syncSuccess = true

      } catch (e) {

        if(currentPageLimit <= 1) break;

        lastCurrentPageLimit = currentPageLimit
        currentPageLimit = Math.floor((currentPageLimit / 3) * 2) || 1

        reporter.warn(
          [
            `The sync with Directus failed using pageLimit ${lastCurrentPageLimit} as the reponse size limit of the API is exceeded.`,
            `Retrying sync with pageLimit of ${currentPageLimit}`,
          ].join(`\n\n`)
        )

        continue
      }
    }
  } catch (e) {
    reporter.panic({
      id: CODES.SyncError,
      context: {
        sourceMessage: `Fetching Directus data failed: ${e.message}`,
      },
    })
  } finally {
    // Fix output when there was no new data in Contentful
    // if (
    //   currentSyncData?.content.length +
    //     currentSyncData?.assets.length +
    //     currentSyncData?.deletedContent.length +
    //     currentSyncData?.deletedAssets.length ===
    //   0
    // ) {
    //   syncProgress.tick()
    //   syncProgress.total = 1
    // }


    syncProgress.done()
  }

  const result = {
    currentSyncData
  }

  return result
}

export async function fetchContentTypes({ pluginOptions, reporter }) {

  const client = new SyncClient(pluginOptions, reporter)
  let contentTypes = null

  reporter.verbose(
    `Fetching content types`
  )
  try {
    contentTypes = await client.getContentTypes()
  } catch (e) {
    reporter.panic({
      id: CODES.FetchContentTypes,
      context: {
        sourceMessage: `Error fetching content types: ${e.message}`,
      },
    })
  }
  reporter.verbose(
    `Content types fetched ${contentTypes.length}`
  )

  return contentTypes
}