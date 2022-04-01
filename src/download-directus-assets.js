import { createRemoteFileNode } from "gatsby-source-filesystem"

/**
 * @name distributeWorkload
 * @param workers A list of async functions to complete
 * @param {number} count The number of task runners to use (see assetDownloadWorkers in config)
 */

async function distributeWorkload(workers, count = 50) {
  const methods = workers.slice()

  async function task() {
    while (methods.length > 0) {
      await methods.pop()()
    }
  }

  await Promise.all(new Array(count).fill(undefined).map(() => task()))
}

/**
 * @name downloadDirectusAssets
 * @description Downloads Directus assets to the local filesystem.
 * The asset files will be downloaded and cached. Use `localFile` to link to them
 * @param gatsbyFunctions - Gatsby's internal helper functions
 */

export async function downloadDirectusAssets(gatsbyFunctions) {
  const {
    actions: { createNode, touchNode, createNodeField },
    createNodeId,
    store,
    cache,
    reporter,
    assetDownloadWorkers,
    pluginOptions,
    getNode,
    assetNodes,
  } = gatsbyFunctions

  // Any DirectusAsset nodes will be downloaded, cached and copied to public/static
  // regardless of if you use `localFile` to link an asset or not.

  const bar = reporter.createProgress(
    `Downloading Directus Assets`,
    assetNodes.length
  )
  bar.start()
  await distributeWorkload(
    assetNodes.map(node => async () => {
      let fileNodeID
      const { directus_id: id } = node
      const remoteDataCacheKey = `directus-asset-${id}`
      const cacheRemoteData = await cache.get(remoteDataCacheKey)
      const url = `${pluginOptions.useSSL ? "https" : "http"}://${pluginOptions.host}/assets/${id}`

      // Avoid downloading the asset again if it's been cached
      // Note: Contentful Assets do not provide useful metadata
      // to compare a modified asset to a cached version?
      if (cacheRemoteData && cacheRemoteData.modified_on === node.modified_on) {
        fileNodeID = cacheRemoteData.fileNodeID
        touchNode(getNode(cacheRemoteData.fileNodeID))
      }

      // If we don't have cached data, download the file
      if (!fileNodeID) {
        const fileNode = await createRemoteFileNode({
          url,
          store,
          cache,
          createNode,
          createNodeId,
          httpHeaders: {
            Authorization: `Bearer ${pluginOptions.accessToken}`,
          },
          reporter,
        })

        if (fileNode) {
          bar.tick()
          fileNodeID = fileNode.id
          await cache.set(remoteDataCacheKey, { fileNodeID, modified_on: node.modified_on })
        }
      }

      if (fileNodeID) {
        createNodeField({ node, name: `localFile`, value: fileNodeID })
      }

      return node
    }),
    assetDownloadWorkers
  )
}