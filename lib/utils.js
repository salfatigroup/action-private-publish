const fs = require("fs")
const path = require("path")
const glob = require("glob")
const core = require("@actions/core")
const { exec } = require('child_process')

/**
 * Load all the inputs from the core actions inputs
 */
module.exports.getInputs = () => {
	const inputs = {
		token: process.env.NODE_AUTH_TOKEN,
		scanGlob: (core.getInput('scan', { required: false }) || './').split(',').map(dir => path.join(process.env.GITHUB_WORKSPACE, dir.trim(), '/**/package.json')),
		ignoreList: core.getInput('ignore', { required: false }).trim().split(','),
		registry: core.getInput('registry', { required: false }) || "https://npm.pkg.github.com",
	}

	// log
	console.log(`Directories to scan: ${inputs.scanGlob.join('\n\t-')}\n`)
	console.log(`Ignore list: ${inputs.ignoreList.join('\n\t-')}\n`)

	return inputs
}

/**
 * Scan the packages according to the provided glob
 * and ignored packages
 */
module.exports.scanPackages = async (scanGlob, ignoreList = []) => {
	const globPromises = scanGlob.map(globPattern => {
		return new Promise((resolve, reject) => {
			glob(
				globPattern,
				{
					ignore: [
						...ignoreList,
						'**/node_modules/**',
					]
				},
				(err, files) => {
					if (err) {
						reject(err)
					} else {
						resolve(files)
					}
				}
			)
		})
	})

	const matchedFiles = await Promise.all(globPromises)
	return matchedFiles.flat()
}

/**
 * Publish packages to NPM
 */
module.exports.publish = (packages, registry, token) => {
	const publishPromises = packages.map(packagePath => {
		// ensure npmrc
		_ensureNpmrc(registry)

		// publish package
		return _publishPackage(packagePath)
	})

	return Promise.all(publishPromises)
}

/**
 * Ensures that the npmrc file exists
 */
function _ensureNpmrc(registry) {
	const npmrcPath = path.join(process.env.HOME, '.npmrc')
	if (fs.existsSync(npmrcPath)) {
		return
	}

	const npmrc = `//${registry}/:_authToken=${process.env.NODE_AUTH_TOKEN}`
	fs.writeFileSync(npmrcPath, npmrc)
}

/**
 * Publishes a single package to NPM
 */
function _publishPackage(packagePath) {
	return new Promise((resolve, reject) => {
		const packageDir = path.dirname(packagePath)
		const cmd = `npm publish ${packageDir}`
		console.log(`\t${cmd}\n`)
		exec(cmd, (err, stdout, stderr) => {
			if (err) {
				reject(err)
			} else {
				resolve(packagePath)
			}
		})
	})
}
