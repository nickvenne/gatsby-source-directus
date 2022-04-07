import _, { update } from "lodash"
import { lt, prerelease } from "semver"
import { getGatsbyVersion } from "gatsby-core-utils"
import os from "os"


const GATSBY_VERSION_MANIFEST_V2 = `4.3.0`
const gatsbyVersion =
  (typeof getGatsbyVersion === `function` && getGatsbyVersion()) || `0.0.0`
const gatsbyVersionIsPrerelease = prerelease(gatsbyVersion)
const shouldUpgradeGatsbyVersion =
  lt(gatsbyVersion, GATSBY_VERSION_MANIFEST_V2) && !gatsbyVersionIsPrerelease


export const makeTypeName = type => _.upperFirst(_.camelCase(`${type}`))

export const getSyncEnv = (pluginOptions) => {
  if(pluginOptions.envId) {
    return pluginOptions.envId
  } else if(process.env.DIRECTUS_ENV_ID) {
    return process.env.DIRECTUS_ENV_ID
  } else if(process.env.NODE_ENV === `development`) {
    const user = os.userInfo()
    return `${user.username}-${user.uid}`
  } else if(process.env.NODE_ENV === `test`) {
    return `test`
  } else if(process.env.NODE_ENV === `production`) {
    return `production`
  } else {
    throw new Error("Directus: No environment ID found. Please set the DIRECTUS_ENV_ID environment variable or the envId option in your gatsby-config.js")
  }
}

export const getUpdatedFunc = (updatedAtKey) => {
  return (node) => {
    return node[updatedAtKey]
  }
}

export const buildEntryList = ({ contentTypeItems, currentSyncData }) => {
  // Create buckets for each type sys.id that we care about (we will always want an array for each, even if its empty)
  const map = new Map(
    contentTypeItems.map(contentType => [contentType.sys.id, []])
  )
  // Now fill the buckets. Ignore entries for which there exists no bucket. (Not sure if that ever happens)
  currentSyncData.content.map(content => {
    const arr = map.get(content.sys.contentType.sys.id)
    if (arr) {
      arr.push(content)
    }
  })
  // Order is relevant, must map 1:1 to contentTypeItems array
  return contentTypeItems.map(contentType => map.get(contentType.sys.id))
}

export const makeId = (id, type) => `${id}__${type}`

let warnOnceForNoSupport = false
let warnOnceToUpgradeGatsby = false

function directusCreateNodeManifest({
  entry,
  entryNode,
  getUpdated,
  reporter,
  unstable_createNodeManifest
}) {
  const createNodeManifestIsSupported = typeof unstable_createNodeManifest === `function`
  
  const updatedAt = getUpdated(entry)

  const manifestId = `${entryNode.directus_collection}-${entryNode.directus_id}-${updatedAt}`

  if(createNodeManifestIsSupported) {

    if (shouldUpgradeGatsbyVersion && !warnOnceToUpgradeGatsby) {
      reporter.warn(
        `Your site is doing more work than it needs to for Preview, upgrade to Gatsby ^${GATSBY_VERSION_MANIFEST_V2} for better performance`
      )
      warnOnceToUpgradeGatsby = true
    }

    unstable_createNodeManifest({
      manifestId,
      node: entryNode,
      updatedAtUTC: updatedAt //TODO: IF BROKEN CONVERT TO UTC
    })
  } else if(
    !createNodeManifestIsSupported && 
    !warnOnceToUpgradeGatsby
  ) {
    reporter.warn(
      `Directus: Your version of Gatsby core doesn't support Content Sync (via the unstable_createNodeManifest action). Please upgrade to the latest version to use Content Sync in your site.`
    )
    warnOnceToUpgradeGatsby = true
  }
}


export const createNodesForContentType = ({
  collection,
  contentTypeItems,
  restrictedNodeFields,
  content,
  createNode,
  createNodeId,
  getNode,
  reporter,
  pluginOptions,
  unstable_createNodeManifest
}) => {
  const createNodePromises = []

  const getUpdated = getUpdatedFunc(pluginOptions.updatedAtKey)

  // const contentTypeNode = {
  //   id: createNodeId(collection),
  //   parent: null,
  //   children: [],
  //   name: collection,~
  //   collection_fields: contentTypeItems[collection].fields,
  //   internal: {
  //     type: `${makeTypeName(collection)}`,
  //     contentDigest: `${collection}`,
  //   }
  // }

  // createNodePromises.push(createNode(contentTypeNode))


  const contentNodes = content.map(entry => {
    const entryNodeId = createNodeId(makeId(entry.id, collection))
    const existingNode = getNode(entryNodeId)
    const contentType = contentTypeItems[collection]

    if(!contentType) {
      reporter.panic(`No content type found for ${collection}`)
    }

    if(!(pluginOptions.updatedAtKey in entry)) {
      reporter.panic(`No updated key found for ${entry.id} type: ${collection}`)
    }

    if(!getUpdated(entry)) {
      entry[pluginOptions.updatedAtKey] = new Date().toISOString()
    }

    if(existingNode && getUpdated(existingNode) === getUpdated(entry)) {
      return null
    }

    //Create reference link for node relationships
    Object.keys(entry).forEach(entryFieldKey => {
      if(entry[entryFieldKey]) {
        const entryValue = entry[entryFieldKey]
        const field = contentType.fields[entryFieldKey]
        if(field && field.isLink) {
          if(field.junctionCollection) {
            entry[entryFieldKey] = Array.isArray(entryValue)
              ? entryValue.map(junction => createNodeId(makeId(junction, field.junctionCollection)))
              : createNodeId(makeId(entryValue, field.junctionCollection))
          
          }
        }
      }
    }) 

    let entryNode = {
      ...entry,
      id: entryNodeId,
      directus_id: entry.id,
      directus_collection: collection,
      children: [],
      internal: {
        type: `${makeTypeName(collection)}`,
        contentDigest: getUpdated(entry)
      }
    }


    directusCreateNodeManifest({
      getUpdated,
      reporter,
      entry,
      entryNode,
      unstable_createNodeManifest
    })

    return entryNode
  }).filter(Boolean)


  contentNodes.forEach(entryNode => {createNodePromises.push(createNode(entryNode))});

  return createNodePromises
}

export const createAssetNodes = ({
  asset,
  createNode,
  createNodeId,
  pluginOptions
}) => {
  const createNodePromises = []
  const url = `${pluginOptions.useSSL ? "https" : "http"}://${pluginOptions.host}/assets/${asset.id}`
  
  const assetNode = {
    ...asset,
    directus_id: asset.id,
    id: createNodeId(makeId(asset.id, "DirectusAsset")),
    parent: null,
    children: [],
    url,
    filename: asset.filename_download,
    mimeType: asset.type,
    internal: {
      type: `DirectusAsset`,
      contentDigest: `${asset.modified_on}`
    }
  }

  const maybePromise = createNode(assetNode)

  createNodePromises.push(
    maybePromise?.then ? maybePromise.then(() => assetNode) : assetNode
  )

  return createNodePromises
}