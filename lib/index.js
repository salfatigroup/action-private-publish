const core = require("@actions/core")
const { getInputs } = require("./utils")

/**
 * Root function of the action
 */
async function run() {
	// debug env
	core.debug(`Environment Variables:\n${JSON.stringify(process.env, null, 2)}`)

	try {
		// get inputs
		const args = getInputs()

		// scan for packages
		const packages = await scanPackages(args.scanGlob, args.ignoreList)
		if (packages.length === 0) {
			core.setFailed(`No modules detected in the codebase.`)
			return
		}

		// publish packages
		const publications = await publish(packages, args.registry, args.token)

		// return outputs
		core.setOutput("modules", Array.from(publications).join(', '))
	} catch (error) {
		core.setFailed(error.message)
	}
}

// run the action
run()
