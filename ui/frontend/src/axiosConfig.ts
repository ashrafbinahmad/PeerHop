import axios from "axios";

// Set custom header immediately to identify desktop app
// This must be imported before any other code that uses axios
axios.defaults.headers.common["X-Client-Type"] = "desktop";

export default axios;
