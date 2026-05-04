/** @type {import('next').NextConfig} */
const nextConfig = {
	webpack: (config) => {
		config.ignoreWarnings = config.ignoreWarnings || [];
		config.ignoreWarnings.push(
			/Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/
		);
		return config;
	},
};

export default nextConfig;
