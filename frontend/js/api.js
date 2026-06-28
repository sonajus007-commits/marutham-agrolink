// ── Core fetch wrapper ────────────────────────────────────────────────────────
async function apiFetch(method, path, body, token) {
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  var opts = { method: method, headers: headers };
  if (body) opts.body = JSON.stringify(body);
  var res = await fetch(CONFIG.API_BASE + path, opts);
  var data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
  return data;
}

function tok() { return getToken(); }

// ── Auth ──────────────────────────────────────────────────────────────────────
var API = {
  login: function(phone, password) {
    return apiFetch('POST', '/auth/login', { phone, password });
  },
  register: function(data) {
    return apiFetch('POST', '/auth/register', data);
  },
  sendOtp: function(phone) {
    return apiFetch('POST', '/auth/send-otp', { phone });
  },
  verifyOtp: function(phone, otp) {
    return apiFetch('POST', '/auth/verify-otp', { phone, otp });
  },
  resetPassword: function(phone, otp, new_password) {
    return apiFetch('POST', '/auth/reset-password', { phone, otp, new_password });
  },
  changePassword: function(current_password, new_password) {
    return apiFetch('POST', '/auth/change-password', { current_password, new_password }, tok());
  },
  createStaff: function(data) {
    return apiFetch('POST', '/auth/create-staff', data, tok());
  },
  getUsers: function() {
    return apiFetch('GET', '/users', null, tok());
  },
  getUserById: function(id) {
    return apiFetch('GET', '/users/' + id, null, tok());
  },
  updateUser: function(id, data) {
    return apiFetch('PATCH', '/users/' + id, data, tok());
  },
  blockUser: function(id) {
    return apiFetch('PATCH', '/users/' + id + '/block', {}, tok());
  },
  unblockUser: function(id) {
    return apiFetch('PATCH', '/users/' + id + '/unblock', {}, tok());
  },
  getChangeRequests: function(status) {
    return apiFetch('GET', '/users/change-requests' + (status ? '?status=' + status : ''), null, tok());
  },
  approveChangeRequest: function(id, notes) {
    return apiFetch('POST', '/users/change-requests/' + id + '/approve', { notes: notes || '' }, tok());
  },
  rejectChangeRequest: function(id, notes) {
    return apiFetch('POST', '/users/change-requests/' + id + '/reject', { notes: notes || '' }, tok());
  },
  submitProfileChangeRequest: function(data) {
    return apiFetch('POST', '/auth/profile-change-request', data, tok());
  },
  getMyChangeRequests: function() {
    return apiFetch('GET', '/auth/my-change-request', null, tok());
  },
  getMe: function() {
    return apiFetch('GET', '/auth/me', null, tok());
  },
  patchMe: function(data) {
    return apiFetch('PATCH', '/auth/me', data, tok());
  },

  // ── Products ──────────────────────────────────────────────────────────────
  getProducts: function(params) {
    var qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch('GET', '/products' + qs, null, tok());
  },
  getProduct: function(id) {
    return apiFetch('GET', '/products/' + id, null, tok());
  },
  createProduct: function(data) {
    return apiFetch('POST', '/products', data, tok());
  },
  updateProduct: function(id, data) {
    return apiFetch('PATCH', '/products/' + id, data, tok());
  },
  saveProductPrices: function(id, prices) {
    return apiFetch('PUT', '/products/' + id + '/prices', { prices: prices }, tok());
  },
  deleteProduct: function(id) {
    return apiFetch('DELETE', '/products/' + id, null, tok());
  },

  // ── Listings ──────────────────────────────────────────────────────────────
  getListings: function(params) {
    var qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch('GET', '/listings' + qs, null, tok());
  },
  getDistrictListings: function(district) {
    return apiFetch('GET', '/listings?district=' + encodeURIComponent(district), null, tok());
  },
  createListing: function(data) {
    return apiFetch('POST', '/listings', data, tok());
  },
  updateListing: function(id, data) {
    return apiFetch('PATCH', '/listings/' + id, data, tok());
  },
  deleteListing: function(id) {
    return apiFetch('DELETE', '/listings/' + id, null, tok());
  },

  // ── Orders ────────────────────────────────────────────────────────────────
  placeOrder: function(data) {
    return apiFetch('POST', '/orders', data, tok());
  },
  getOrders: function(params) {
    var qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch('GET', '/orders' + qs, null, tok());
  },
  getOrder: function(id) {
    return apiFetch('GET', '/orders/' + id, null, tok());
  },
  cancelOrder: function(id, reason) {
    return apiFetch('POST', '/orders/' + id + '/cancel', { cancel_reason: reason }, tok());
  },

  // ── Delivery ──────────────────────────────────────────────────────────────
  trackOrder: function(id) {
    return apiFetch('GET', '/orders/' + id + '/track', null, tok());
  },
  packOrder: function(id) {
    return apiFetch('POST', '/orders/' + id + '/pack', {}, tok());
  },
  scanOrder: function(id, routeHint) {
    var body = routeHint ? { route: routeHint } : {};
    return apiFetch('POST', '/orders/' + id + '/scan', body, tok());
  },
  assignAgent: function(id, agentId) {
    return apiFetch('POST', '/orders/' + id + '/assign', { agent_id: agentId }, tok());
  },
  getAgents: function(district) {
    var qs = district ? '?district=' + encodeURIComponent(district) : '';
    return apiFetch('GET', '/users' + qs, null, tok());
  },
  deliverOrder: function(id) {
    return apiFetch('POST', '/orders/' + id + '/deliver', {}, tok());
  },

  // ── Returns ───────────────────────────────────────────────────────────────
  requestReturn: function(orderId, data) {
    return apiFetch('POST', '/orders/' + orderId + '/return', data, tok());
  },
  getReturns: function() {
    return apiFetch('GET', '/returns', null, tok());
  },
  decideReturn: function(id, decision) {
    return apiFetch('PATCH', '/returns/' + id + '/decide', { decision }, tok());
  },
  collectReturn: function(id) {
    return apiFetch('PATCH', '/returns/' + id + '/collect', {}, tok());
  },

  // ── Ratings ───────────────────────────────────────────────────────────────
  rateItem: function(orderId, itemId, ratingValue) {
    return apiFetch('POST', '/orders/' + orderId + '/items/' + itemId + '/rate', { rating_value: ratingValue }, tok());
  },
  getTopRatings: function() {
    return apiFetch('GET', '/ratings/top', null, tok());
  },

  // ── Config ────────────────────────────────────────────────────────────────
  getOrderingWindow: function() {
    return apiFetch('GET', '/config/ordering-window');
  },
  setOrderingWindow: function(open_hour, close_hour) {
    return apiFetch('PUT', '/config/ordering-window', { open_hour, close_hour }, tok());
  },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  getDashboard: function(params) {
    var qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch('GET', '/dashboard' + qs, null, tok());
  },

  // ── Payouts ───────────────────────────────────────────────────────────────
  getPayouts: function() {
    return apiFetch('GET', '/payouts', null, tok());
  },
  runPayouts: function() {
    return apiFetch('POST', '/payouts/run', {}, tok());
  },

  // ── Farmers directory ─────────────────────────────────────────────────────
  getFarmers: function() {
    return apiFetch('GET', '/farmers', null, tok());
  },
  blockFarmer: function(id) {
    return apiFetch('PATCH', '/farmers/' + id + '/block', {}, tok());
  },
  unblockFarmer: function(id) {
    return apiFetch('PATCH', '/farmers/' + id + '/unblock', {}, tok());
  },

  // ── Consumers directory ───────────────────────────────────────────────────
  getConsumers: function() {
    return apiFetch('GET', '/consumers', null, tok());
  },
  blockConsumer: function(id) {
    return apiFetch('PATCH', '/consumers/' + id + '/block', {}, tok());
  },
  unblockConsumer: function(id) {
    return apiFetch('PATCH', '/consumers/' + id + '/unblock', {}, tok());
  },

  // ── Registrations (approval workflow) ────────────────────────────────────
  getRegistrations: function(status) {
    var qs = status ? '?status=' + encodeURIComponent(status) : '';
    return apiFetch('GET', '/registrations' + qs, null, tok());
  },
  getRegistration: function(id) {
    return apiFetch('GET', '/registrations/' + id, null, tok());
  },
  approveRegistration: function(id, subscription_amount) {
    return apiFetch('POST', '/registrations/' + id + '/approve', { subscription_amount }, tok());
  },
  rejectRegistration: function(id, reason) {
    return apiFetch('POST', '/registrations/' + id + '/reject', { reason }, tok());
  },
  confirmPayment: function(id) {
    return apiFetch('POST', '/registrations/' + id + '/confirm-payment', {}, tok());
  },
};
