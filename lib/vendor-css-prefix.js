var prefix = (window.opera && Object.prototype.toString.call(window.opera) === '[object Opera]') ? 'o' :
					(document.documentElement.style.hasOwnProperty('MozAppearance')) ? 'Moz' :
					(document.documentElement.style.hasOwnProperty('WebkitAppearance')) ? 'webkit' :
					(typeof navigator.cpuClass === 'string') ? 'ms' : '';

module.exports = {
	transform:  (prefix ? prefix + 'T' : 't') + 'ransform',
	transition: (prefix ? prefix + 'T' : 't') + 'ransition'
};