import request from 'request'
import _ from 'lodash'
import Promise from 'bluebird'
var requestPromise = Promise.promisifyAll(require('request'))

var inProgressState = 'IN_PROGRESS'
var pendingPreApprovalState = 'PENDING_PRE_APPROVAL'
var submittedState = 'SUBMITTED'

/* istanbul ignore next */
module.exports = {
  submit: submit,
  getAll: getAll,
  getByName: getByName,
  getRequestsByName: getRequestsByName,
  getObjectFromKey: getObjectFromKey,
  get: get,
  getAllCatalogItems: getAllCatalogItems,
  getTemplate: getTemplate,
  sendRequest: sendRequest,
  updateTemplateData: updateTemplateData
}

function getRequestsByName (catalogItemName, customerIdName, cidKeyName) {
  var _this = this

  return new Promise(function (resolve, reject) {
    var options = {
      method: 'GET',
      agent: _this.config.agent,
      url: `https://${_this.config.hostname}/catalog-service/api/consumer/requests?limit=1000&$filter=(catalogItem/name eq '${catalogItemName}')`,
      headers: {
        'cache-control': 'no-cache',
        'content-type': 'application/json',
        'authorization': `Bearer ${_this.config.token.id}`
      },
      body: {},
      json: true
    }

    requestPromise.getAsync(options)
    .then(function (response) {
      if (response.statusCode !== 200) {
        return reject(response.body)
      }

    // could nto find any reuqests with given name
      if (!response.body || !response.body.content) {
        return resolve([])
      }

      var content = response.body.content
      var matchingCidrequests = []
      for (var i = 0; i < content.length; i++) {
        var requestItem = content[i]

        if (requestItem && requestItem.requestData && requestItem.requestData.entries) {
          for (var j = 0; j < requestItem.requestData.entries.length; j++) {
            var requestData = requestItem.requestData.entries[j]
            if (requestData.key === cidKeyName && requestData.value.value === customerIdName) {
              matchingCidrequests.push(requestItem)
            }
          }
        }
      }
      resolve(matchingCidrequests)
    })
    .catch(function (error) {
      reject(error)
    })
  })
}

function getAllCatalogItems (cb) {
  var options = {
    method: 'GET',
    agent: this.config.agent,
    url: `https://${this.config.hostname}/catalog-service/api/consumer/entitledCatalogItemViews?limit=1000`,
    headers: {
      'cache-control': 'no-cache',
      'content-type': 'application/json',
      'authorization': `Bearer ${this.config.token.id}`
    },
    body: {},
    json: true
  }

  request.get(options, function (error, response, body) {
    if (error) {
      cb(error)
    }

    if (response.statusCode === 200) {
      let items = []
      body.content.forEach(function (item) {
        var res = {}
        res.name = item.name
        res.id = item.catalogItemId
        res.submitRequestUrl = item.links[1].href
        res.submitRequestUrlMethod = item.links[1].rel
        // res.catalogResourceLabel = item.catalogResource.label
        // res.catalogResourceId = item.catalogResource.id
        items.push(res)
      }, this)
      cb(null, JSON.stringify(items, null, 2))
    } else {
      cb(JSON.stringify(body))
    }
  })
}

function submit (deploymentOptions, cb) {
  var _this = this
  _this.getByName(deploymentOptions.blueprintName, function (error, response) {
    if (error) {
      return cb(error, null)
    }

    var urlTemplate = response.links[0].href
    var urlRequest = response.links[1].href

    _this.getTemplate(urlTemplate, function (error, templateData) {
      if (error) {
        return cb(error, null)
      }

      _this.updateTemplateData(templateData, deploymentOptions.templateData, function (err, mergedTemplateData) {
        if (err) {
          return cb(error, null)
        }
        _this.sendRequest(urlRequest, mergedTemplateData, function (error, response) {
          if (error) {
            return cb(error, null)
          }
          cb(null, response)
        })
      })
    })
  })
}

function getByName (name, cb) {
  var options = {
    method: 'GET',
    agent: this.config.agent,
    url: `https://${this.config.hostname}/catalog-service/api/consumer/entitledCatalogItemViews?limit=1000&$filter=(name eq '${name}')`,
    headers: {
      'cache-control': 'no-cache',
      'content-type': 'application/json',
      'authorization': `Bearer ${this.config.token.id}`
    },
    body: {},
    json: true
  }

  request.get(options, function (error, response, body) {
    if (error) {
      return cb(error)
    }

    if (response.statusCode === 200) {
      cb(null, body.content[0])
    } else {
      cb(JSON.stringify(body, null, 2))
    }
  })
}

function updateTemplateData (templateData, dataToBeMerged, callback) {
  var node
  if (dataToBeMerged) {
    dataToBeMerged.forEach(function (elem) {
      node = templateData
      if (elem.path.length > 0) {
        var properties = elem.path.split('.')
        properties.forEach(function (property) {
          node = node[property]
        })
      }
      node[elem.leaf] = elem.value
    })
  }
  callback(null, templateData)
}

function getTemplate (url, cb) {
  var options = {
    method: 'GET',
    agent: this.config.agent,
    url: url,
    headers: {
      'cache-control': 'no-cache',
      'content-type': 'application/json',
      'authorization': `Bearer ${this.config.token.id}`
    },
    body: {},
    json: true
  }

  request.get(options, function (error, response, body) {
    if (error) {
      return cb(error)
    }

    if (response.statusCode === 200) {
      cb(null, body)
    } else {
      cb(JSON.stringify(body, null, 2))
    }
  })
}

function sendRequest (url, data, cb) {
  var options = {
    method: 'POST',
    agent: this.config.agent,
    url: url,
    headers: {
      'cache-control': 'no-cache',
      'content-type': 'application/json',
      'authorization': `Bearer ${this.config.token.id}`
    },
    body: data,
    json: true
  }

  request.post(options, function (error, response, body) {
    if (error) {
      return cb(error)
    }
    if (response.statusCode === 201) {
      cb(null, body)
    } else {
      cb(body)
    }
  })
}

function get (params, cb) {
  var options = {
    method: 'GET',
    agent: this.config.agent,
    url: `https://${this.config.hostname}/catalog-service/api/consumer/requests/${params.id}`,
    headers: {
      'cache-control': 'no-cache',
      'content-type': 'application/json',
      'authorization': `Bearer ${this.config.token.id}`
    },
    json: true
  }

  request.get(options, function (error, response, body) {
    if (error) {
      return cb(error)
    }
    if (response.statusCode === 200) {
      var result = 'ERROR'
      if (params.raw === false) {
        if (body.state === inProgressState || body.state === pendingPreApprovalState || body.state === submittedState) {
          result = inProgressState
        } else {
          var requestCompletion = body.requestCompletion
          /* istanbul ignore next */
          if (requestCompletion) {
            result = requestCompletion.requestCompletionState
          }
        }
      } else {
        result = body
      }
      return cb(null, result)
    } else {
      cb(body)
    }
  })
}

function getAll (obj, cb) {
  var options = {
    method: 'GET',
    agent: this.config.agent,
    url: `https://${this.config.hostname}/catalog-service/api/consumer/requests/`,
    headers: {
      'cache-control': 'no-cache',
      'content-type': 'application/json',
      'authorization': `Bearer ${this.config.token.id}`
    },
    json: true
  }

  request.get(options, function (error, response, body) {
    if (error) {
      return cb(error)
    }
    if (response.statusCode === 200) {
      cb(null, body)
    } else {
      cb(body)
    }
  })
}

function getObjectFromKey (jsonObject, key) {
  var indexCID = _.findIndex(jsonObject.entries, function (o) {
    return o.key === key
  })
  // 'key', 'y.Hostname.CID')
  if (indexCID === -1) {
    return null
  }
  return jsonObject.entries[indexCID]
}
