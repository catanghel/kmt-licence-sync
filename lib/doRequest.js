const KMTError = require('./error');

module.exports = (theUrl, options, expectedFormat = "json") => {
  return fetch(theUrl, options).then((response) => {
    // if the request succeeds (2xx status code)
    if (response.status.toString().indexOf("2") === 0) {
      return response;
    }

    // throw the error
    throw new KMTError(response.statusText, response.status);
  }).then((response) => {
    const noParsingStatus = [204]; //[204 (No Content)]
    // if the response is found in the array
    if (noParsingStatus.indexOf(response.status) !== -1) {
      expectedFormat = "text";
    }
    return response;

  }).then((response) => {
    // if the response format is expected to be JSON
    if (expectedFormat.toLowerCase() === "json") {
      return response.json();
    }
    return response.text();

  }).then((response) => {
    return response;
  });
};
