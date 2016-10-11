/*global Buffer*/
const logger = require('../logger');
const doRequest = require('./../doRequest');
const apiRoot = process.env.MYFT_API_URL;
const reqOpt = {
  credentials: "include",
  headers: {
    'X-API-KEY': process.env.MYFT_API_KEY,
    'Content-Type': 'application/json'
  }
};

const myFtService = {
  getLicence: (licenceId) => {
    logger.debug({operation: 'myFtService.getLicence', licenceId});

    return myFtService.doRelationshipRequest("GET", "license", licenceId);
  },

  setLicence: (data) => {
    logger.debug({operation: 'myFtService.setLicence', data});

    return myFtService.doRelationshipRequest("POST", "license", undefined, undefined, undefined, data);
  },

  updateLicence: (licenceId, data) => {
    logger.debug({operation: 'myFtService.updateLicence', data});

    return myFtService.doRelationshipRequest("PUT", "license", licenceId, undefined, undefined, data);
  },

  getUsers: (forId, type) => {
    logger.debug({operation: 'myFtService.getUsers', forId, type});

    return myFtService.doRelationshipRequest("GET", type, forId, "member", "user");
  },

  setLicenceUser: (licenceId, data) => {
    logger.debug({operation: 'myFtService.setLicenceUser', licenceId, data});

    return myFtService.doRelationshipRequest("POST", "license", licenceId, "member", "user", data);
  },

  setGroupUser: (licenceId, data) => {
    logger.debug({operation: 'myFtService.setGroupUser', licenceId, data});

    return myFtService.doRelationshipRequest("POST", "group", licenceId, "member", "user", data);
  },

  setLicenceUsers: (data) => {
    logger.debug({operation: 'myFtService.setLicenceUsers', data});

    return myFtService.doRelationshipRequest("POST", "license", undefined, "member", "user", data);
  },

  setGroupUsers: (data) => {
    logger.debug({operation: 'myFtService.setGroupUsers', data});

    return myFtService.doRelationshipRequest("POST", "group", undefined, "member", "user", data);
  },

  setGroup: (licenceId, data) => {
    logger.debug({operation: 'myFtService.setGroup', licenceId, data});

    return myFtService.doRelationshipRequest("POST", "license", licenceId, "member", "group", data);
  },

  getGroup: (licenceId) => {
    logger.debug({operation: 'myFtService.getGroup', licenceId});

    return myFtService.doRelationshipRequest("GET", "group", licenceId);
  },

  doRelationshipRequest: (method, type, id, relationship, relatedType, data) => {
    logger.debug({operation: 'myFtService.doRelationshipRequest', method, type, id, relationship, relatedType, data});

    let theUrl = `${apiRoot}/${type}`;
    const options = Object.assign({}, reqOpt, { method: method });

    if (id !== undefined) {
      theUrl += `/${id}`;
    }
    if (relationship !== undefined) {
      theUrl += `/${relationship}`;
    }
    if (relatedType !== undefined) {
      theUrl += `/${relatedType}`;
    }

    if (method !== "GET") {

      // fiddle content length header to appease Fastly
      if(process && process.env.NODE_ENV === 'production') {
        // Fastly requires that empty requests have an empty object for a body and local API requires that they don't
        options.body = JSON.stringify(data || {});

        reqOpt.headers['Content-Length'] = Buffer.byteLength(options.body);

      } else {
        options.body = data ? JSON.stringify(data) : null;
      }
    }

    return doRequest(theUrl, options).then(res => res).catch((error) => {
      // if we get a 404 => return an empty object
      if (error.status === 404) {
        return {};
      }

      logger.error({operation: 'myFtService.doRelationshipRequest', method, type, id, relationship, relatedType, data, error});
      return error;
    });
  }
};

module.exports = myFtService;
