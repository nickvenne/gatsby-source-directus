import { addRemoteFilePolyfillInterface } from "gatsby-plugin-utils/polyfill-remote-file"
import { makeTypeName } from "./normalize"
import { fetchContentTypes } from "./fetch"
import { CODES } from "./report"
import _ from "lodash"

function getLinkFields(fields) {
  const fieldTypes = []
  for(const field in fields) {
    if(fields[field].isLink) {
      if(fields[field].hasMany) {
        fieldTypes.push({
          name: field,
          type: `[${makeTypeName(fields[field].junctionCollection)}]`,
        })
      } else {
        fieldTypes.push({
          name: field,
          type: `${makeTypeName(fields[field].junctionCollection)}`,
        })
      }
    }
  }
  return fieldTypes.map(field => `${field.name}: ${field.type} @link`).join("\n")
}

async function getContentTypesFromDirectus({
  cache,
  reporter,
  pluginOptions,
}) {
  // Get content type items from Directus
  const contentTypeItems = await fetchContentTypes({ pluginOptions, reporter })
  const restrictedContentTypes = [`entity`, `reference`, `asset`]

  Object.keys(contentTypeItems).forEach(key => {
    // Establish identifier for content type
    //  Use `name` if specified, otherwise, use internal id (usually a natural-language constant,
    //  but sometimes a base62 uuid generated by Contentful, hence the option)
    let contentTypeItemId = key

    if (restrictedContentTypes.includes(contentTypeItemId)) {
      reporter.panic({
        id: CODES.FetchContentTypes,
        context: {
          sourceMessage: `Restricted ContentType name found. The name "${contentTypeItemId}" is not allowed.`,
        },
      })
    }
  })

  // Store processed content types in cache for sourceNodes
  const CACHE_CONTENT_TYPES = `directus-content-types`
  await cache.set(CACHE_CONTENT_TYPES, contentTypeItems)

  return contentTypeItems
}

export async function createSchemaCustomization(
  { schema, actions, reporter, cache },
  pluginOptions
) {
  const { createTypes } = actions


  let contentTypeItems
  if (process.env.GATSBY_WORKER_ID) {
    contentTypeItems = await cache.get(`directus-content-types`)
  } else {
    contentTypeItems = await getContentTypesFromDirectus({
      cache,
      reporter,
      pluginOptions,
    })
  }


  directusTypes.push(
    addRemoteFilePolyfillInterface(
      schema.buildObjectType({
        name: `DirectusFiles`,
        fields: {
          directus_id: { type: `String!` },
          id: { type: `ID!` },
          
          ...(pluginOptions.downloadLocal
            ? {
                localFile: {
                  type: `File`,
                  extensions: {
                    link: {
                      from: `fields.localFile`,
                    },
                  },
                },
              }
            : {}),
        },
        interfaces: [`Node`, `RemoteFile`],
      }),
      {
        schema,
        actions
      }
    )
  )

  // Create types for each content type
  Object.keys(contentTypeItems).forEach(collection =>
    directusTypes.push(
      `
        type ${makeTypeName(collection)} implements Node {
          directus_id: String!
          directus_collection: String!
          id: ID!
          ${getLinkFields(contentTypeItems[collection].fields)}
        }
      `
    )
  )
  
  createTypes(directusTypes)

}