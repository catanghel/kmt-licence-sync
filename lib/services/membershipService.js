const logger = require('./../logger');
const doRequest = require('./../doRequest');
const apiRoot = process.env.LICENCE_DATA_SVC_HOST;
const reqOpt = {
  credentials: "include",
  headers: {
    'X-API-KEY': process.env.MEMCOM_APIKEY,
    'Content-Type': 'application/json'
  }
};

module.exports = {
  readLicence: (licenceId) => {
    logger.debug({operation: 'membershipService.readLicence', licenceId});

    const theUrl = `${apiRoot}/membership/licence-seat-holders/${licenceId}`;
    const options = Object.assign({}, reqOpt, { method: "GET" });

    return doRequest(theUrl, options).then(res => res).catch((error) => {
      // if we get a 404 => return an empty object
      if (error.status === 404) {
        return {};
      }

      logger.error({operation: 'membershipService.readLicence', licenceId, error});
      throw error;
    });
  }
};
