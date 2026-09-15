import "./harness.css"

import { mountHarness } from "../harness-entry"

mountHarness({ container: document.getElementById("root")!, devtools: true })
