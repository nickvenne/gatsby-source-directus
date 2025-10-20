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

export const makeId = (id, type) => `${id}__${type}`

let warnOnceForNoSupport = false
let warnOnceToUpgradeGatsby = false

function prepareMarkdownNode(id, node, key, text, updateAtKey) {
  const str = _.isString(text) ? text : ``
  const updatedAt = getUpdatedFunc(updateAtKey)(node)
  const textNode = {
    id,
    parent: node.id,
    children: [],
    [key]: str,
    [updateAtKey]: updatedAt,
    internal: {
      type: _.camelCase(`${node.internal.type} ${key} TextNode`),
      mediaType: `text/markdown`,
      content: str,
      contentDigest: updatedAt,
    }
  }

  node.children = node.children.concat([id])

  return textNode
}

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

  const childrenNodes = []

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


    let entryNode = {
      id: entryNodeId,
      directus_id: entry.id,
      directus_collection: collection,
      children: [],
      [pluginOptions.updatedAtKey]: getUpdated(entry),
      internal: {
        type: `${makeTypeName(collection)}`,
        contentDigest: getUpdated(entry)
      }
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
        } else if(field && field.hasHTML) {
          const fileRegex = new RegExp(`(?:(src|data-src)=['"](${pluginOptions.useSSL ? "https" : "http"}:\/\/${pluginOptions.host})?\/assets\/)([%:\/A-z<_&\s=>0-9;-]+)`, `g`)
          const fileGroupRegex = new RegExp(`(?:(src|data-src)=['"](${pluginOptions.useSSL ? "https" : "http"}:\/\/${pluginOptions.host})?\/assets\/)([%:\/A-z<_&\s=>0-9;-]+)`)
          const files = entryValue.match(fileRegex)
          if (!files || files.length === 0) return;
          let images = []
          for(let i = 0; i < files.length; i++) {
            const file = files[i]
            const fileGroup = file.match(fileGroupRegex)
            const fileId = fileGroup[3]
            images.push(createNodeId(makeId(fileId, "directus_files")))
          }
          entry[`${entryFieldKey}_images`] = images
        } else if(field && field.hasMarkdown) {
          const textNodeId = createNodeId(
            `${entryNodeId}${entryFieldKey}TextNode`
          )
          const existingNode = getNode(textNodeId)
          if (!existingNode || getUpdated(existingNode) !== getUpdated(entry)) {
            const textNode = prepareMarkdownNode(
              textNodeId,
              entryNode,
              entryFieldKey,
              entry[entryFieldKey],
              pluginOptions.updatedAtKey
            )
            childrenNodes.push(textNode)
            entry[`${entryFieldKey}___NODE`] = textNodeId
            delete entry[entryFieldKey]
          }
        }
      }
    })
    
    entryNode = {
      ...entry,
      ...entryNode
    }

    if(contentType.hasGatsbyPage) {
      directusCreateNodeManifest({
        getUpdated,
        reporter,
        entry,
        entryNode,
        unstable_createNodeManifest
      })
    }

    return entryNode
  }).filter(Boolean)


  contentNodes.forEach(entryNode => {createNodePromises.push(createNode(entryNode))});
  childrenNodes.forEach(entryNode => {
    createNodePromises.push(createNode(entryNode))
  })

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
    id: createNodeId(makeId(asset.id, "directus_files")),
    parent: null,
    children: [],
    url,
    filename: asset.filename_download,
    mimeType: asset.type,
    internal: {
      type: `DirectusFiles`,
      contentDigest: `${asset.modified_on}`
    }
  }

  const maybePromise = createNode(assetNode)

  createNodePromises.push(
    maybePromise?.then ? maybePromise.then(() => assetNode) : assetNode
  )

  return createNodePromises
}
