import axios from "axios"
import { CODES } from "./report"
import { getSyncEnv } from "./normalize"

const DIRECTUS_SYNC_CONTENT = `/gatsby-sync-api/content`
const DIRECUTS_SYNC_TYPES = `/gatsby-sync-api/types`

class SyncClient {
  constructor(pluginOptions, contentTypes, reporter, syncProgress) {
    this.instance = axios.create({
      baseURL: `${pluginOptions.useSSL ? `https` : `http`}://${pluginOptions.host}/`,
      timeout: 10000,
      headers: {
        "Authorization": `Bearer ${pluginOptions.accessToken}`,
      }
    })
  
    this.reporter = reporter
    this.contentTypes = contentTypes
    this.pluginOptions = pluginOptions
  
    this.syncProgress = syncProgress
    this.syncProgressTotal = 0
  }

  _getFilterIds(ids) {
    const filterJson = {
      id: {
        _in: ids
      }
    }
    return ids.length > 0 ? `&filter=${JSON.stringify(filterJson)}` : ``
  }

  async _callApi(url, limit, ids, fields = false, contentType = false) {
    try {
      let currentPage = 1;
      let totalCount = ids.length;
      let currentCount = 0;
      let result = []
      do {
        const { data } = await this.instance.get(`${url}?limit=${limit}&meta=total_count&page=${currentPage}${fields ? `&${fields}` : ``}${this._getFilterIds(ids)}`)
        const itemCount = data.data.length
        currentCount += itemCount
        if(ids.length === 0) {
          totalCount = data.meta.total_count
        }

        result = result.concat(data.data)
        currentPage++

        //Sync progress
        this.syncProgressTotal += itemCount
        this.syncProgress.total = this.syncProgressTotal
        this.syncProgress.tick(itemCount)
        
      } while(currentCount < totalCount)

      if(fields && contentType) {
        for(const item of result) {
          for(const field in contentType.fields) {
            if(contentType.fields[field].junctionField) {
              item[field] = item[field].map((junctionItem) => junctionItem[contentType.fields[field].junctionField])
            }
          }
        }
      }

      return result

    } catch (e) {
      this.reporter.panic({
        id: CODES.SyncError,
        context: {
          sourceMessage: `Fetching Directus data failed: ${e.message}`,
        },
      })
    }
  }

  _getFieldsQuery(contentType) {
    let fieldString = `fields=*`
    let hasFields = false
    for(const field in contentType.fields) {
      if(contentType.fields[field].junctionField) {
        hasFields = true
        fieldString += `,${field}.${contentType.fields[field].junctionField}`
      }
    }
    return hasFields ? fieldString : false
  }

  async _getAssets(limit, ids) {
    return this._callApi(`/files`, limit, ids)
  } 

  async _getCollection(collection, limit, ids, contentType) {
    return this._callApi(`/items/${collection}`, limit, ids, this._getFieldsQuery(contentType), contentType)
  }

  async sync(query) {
    const isInitial = query.initial
    const syncEnv = getSyncEnv(this.pluginOptions)
    this.reporter.info(`Directus Sync environment: ${syncEnv}`)
    const { data: { content, assets, nextSyncToken, deletedContent = {}, deletedAssets = [], meta } } = await this.instance.get(`${DIRECTUS_SYNC_CONTENT}?env=${syncEnv}${query.nextSyncToken ? `&sync_token=${query.nextSyncToken}` : ``}`)
    if(this.pluginOptions.filterCollections) {
      for(const key in content) {
        if(!this.pluginOptions.filterCollections.includes(key)) {
          delete content[key]
          if(key in deletedContent)
            delete deletedContent[key]
        }
      }
    }
    let currentSyncData = {
      content: {},
      assets: [],
      deletedContent,
      deletedAssets,
      meta,
      nextSyncToken
    }

    for(const collection in content) {
      if(!isInitial && !content[collection].length) continue
      currentSyncData.content[collection] = await this._getCollection(collection, query.limit, isInitial ? [] : content[collection], this.contentTypes[collection])
    } 

    if(isInitial || assets.length > 0) 
      currentSyncData.assets = await this._getAssets(query.limit, isInitial ? [] : assets)

    if(isInitial) { 
      currentSyncData.meta.newAssets = currentSyncData.assets.length
      currentSyncData.meta.newContent = Object.values(currentSyncData.content).reduce((acc, content) => acc + content.length, 0)
    }

    return currentSyncData
  }

  async getContentTypes() {
    try {
      const { data } = await this.instance.get(DIRECUTS_SYNC_TYPES)
      if(this.pluginOptions.filterCollections) {
        const filteredTypes = []
        for(const filter of this.pluginOptions.filterCollections) {
          if(filter in data) {
            filteredTypes[filter] = data[filter]
          }
        }
        return filteredTypes
      }
      return data
    } catch (e) {
      this.reporter.panic({
        id: CODES.SyncError,
        context: {
          sourceMessage: `Fetching Directus types failed: ${e.message}`,
        },
      })
    }
  }
}

export default SyncClient