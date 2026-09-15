// @ts-check
// The docs site is linted with the repository configuration; the generated
// fumadocs collection (.source) and the published schemas are not source.
import root from "../../eslint.config.js"

export default [...root, { ignores: [".source/**", "public/**", ".output/**", ".tanstack/**"] }]
