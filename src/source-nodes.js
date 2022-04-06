import { CODES } from "./report"
import { fetchContent } from "./fetch"
import { createNodesForContentType, createAssetNodes, makeId } from "./normalize"
import { downloadDirectusAssets } from "./download-directus-assets"


// restrictedNodeFields from here https://www.gatsbyjs.com/docs/node-interface/
const restrictedNodeFields = [
  `children`,
  `contentful_id`,
  `fields`,
  `id`,
  `internal`,
  `parent`,
]

export async function sourceNodes(
  {
    actions,
    getNode,
    getNodes,
    createNodeId,
    store,
    cache,
    getCache,
    reporter,
    parentSpan,
  },
  pluginOptions
) {
  const { createNode, touchNode, deleteNode, unstable_createNodeManifest } = actions

  //Touch all the nodes that are already in the store
  getNodes().forEach(node => {
    if (node.internal.owner !== `gatsby-source-directus9`) {
      return
    }
    touchNode(node)
    if (node?.fields?.localFile) {
      // Prevent GraphQL type inference from crashing on this property
      touchNode(getNode(node.fields.localFile))
    }
  })

  const fetchActivity = reporter.activityTimer(`Directus: Fetch data`, {
    parentSpan,
  })

  fetchActivity.start()

  const CACHE_SYNC_TOKEN = `directus-sync-token`
  const CACHE_CONTENT_TYPES = `directus-content-types`


  const syncToken =
    store.getState().status.plugins?.[`gatsby-source-directus9`]?.[
      CACHE_SYNC_TOKEN
    ]

  const contentTypeItems = await cache.get(CACHE_CONTENT_TYPES)

  const {
    currentSyncData
  } = await fetchContent({ syncToken, contentTypes: contentTypeItems,  pluginOptions, reporter})

  const nextSyncToken = currentSyncData.nextSyncToken

  actions.setPluginStatus({
    [CACHE_SYNC_TOKEN]: nextSyncToken,
  })

  fetchActivity.end()

  // Process data fetch results and turn them into GraphQL entities
  const processingActivity = reporter.activityTimer(
    `Directus: Process data`,
    {
      parentSpan,
    }
  )
  processingActivity.start()

  // Array of all existing Contentful nodes
  const existingNodes = getNodes().filter(
    n =>
      n.internal.owner === `gatsby-source-directus9`
  )

  // Report existing, new and updated nodes
  const nodeCounts = {
    newContent: currentSyncData.meta.newContent,
    newAsset: currentSyncData.meta.newAssets,
    updatedContent: currentSyncData.meta.updatedContent,
    updatedAsset: currentSyncData.meta.updatedAssets,
    existingContent: 0,
    existingAsset: 0,
    deletedContent: currentSyncData.meta.deletedContent,
    deletedAsset: currentSyncData.meta.deletedAssets,
  }

  existingNodes.forEach(node => {
    if(node.internal.type === "DirectusAsset") {
      nodeCounts.existingAsset++
    } else {
      nodeCounts.existingContent++
    }
  })

  reporter.info(`Directus: ${nodeCounts.newContent} new content`)
  reporter.info(`Directus: ${nodeCounts.updatedContent} updated content`)
  reporter.info(`Directus: ${nodeCounts.deletedContent} deleted content`)
  reporter.info(`Directus: ${nodeCounts.existingContent} cached content`)
  reporter.info(`Directus: ${nodeCounts.newAsset} new assets`)
  reporter.info(`Directus: ${nodeCounts.updatedAsset} updated assets`)
  reporter.info(`Directus: ${nodeCounts.existingAsset} cached assets`)
  reporter.info(`Directus: ${nodeCounts.deletedAsset} deleted assets`)

  function deleteDirectusNode(id, type) {
    const node = getNode(createNodeId(makeId(id, type)))
    touchNode(node)
    deleteNode(node)
  }

  if (Object.keys(currentSyncData.deletedContent).length || currentSyncData.deletedAssets.length) {
    const deletionActivity = reporter.activityTimer(
      `Directus: Deleting nodes and assets`,
      {
        parentSpan,
      }
    )
    deletionActivity.start()
    for(const deletedCollectionContent in currentSyncData.deletedContent) {
      for(const id of currentSyncData.deletedContent[deletedCollectionContent]) {
        deleteDirectusNode(id, deletedCollectionContent)
        existingNodes.existingContent--
      }
    }
    for(const id of currentSyncData.deletedAssets) {
      deleteDirectusNode(id, `DirectusAsset`)
      existingNodes.existingAsset--
    }
    deletionActivity.end()
  }


  const creationActivity = reporter.activityTimer(`Directus: Create nodes`, {
    parentSpan,
  })
  creationActivity.start()

  for(let collection in currentSyncData.content) {
    const data = currentSyncData.content[collection]
    
    if(data.length > 0) {
      reporter.info(`Directus: Creating ${data.length} ${collection} nodes`)
    }

    await Promise.all(
      createNodesForContentType({
        collection,
        contentTypeItems,
        restrictedNodeFields,
        content: data,
        createNode,
        createNodeId,
        reporter,
        getNode,
        pluginOptions,
        unstable_createNodeManifest
      })
    )
  }

  if (currentSyncData.assets.length) {
    reporter.info(`Creating ${currentSyncData.assets.length} Directus asset nodes`)
  }

  const assetNodes = []
  for(let asset in currentSyncData.assets) {
    assetNodes.push(
      ...(await Promise.all(
        createAssetNodes({
          asset: currentSyncData.assets[asset],
          createNode,
          createNodeId,
          pluginOptions
        })
      ))
    )
  }

  creationActivity.end()

  // Download asset files to local fs
  if (pluginOptions.downloadLocal) {
    await downloadDirectusAssets({
      assetNodes,
      actions,
      createNodeId,
      store,
      cache,
      getCache,
      getNode,
      reporter,
      pluginOptions,
      assetDownloadWorkers: pluginOptions.assetDownloadWorkers
    })
  }


}