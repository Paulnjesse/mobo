const get  = jest.fn();
const post = jest.fn();
const put  = jest.fn();
const del  = jest.fn();

const axios = { get, post, put, delete: del };
module.exports = axios;
module.exports.default = axios;
