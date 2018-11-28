module.exports = function(defaults, options) {

	var obj = {},
		i;

	options = Object(options);

	for (i in defaults) {
		if (defaults.hasOwnProperty(i)) {
			obj[i] = (options[i] === undefined) ? defaults[i] : options[i];
		}
	}

	return obj;
};