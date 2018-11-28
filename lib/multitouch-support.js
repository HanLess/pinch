// Determine whether multitouch is supported.
// There appears to be no nice programmatic way to detect this.  Devices which support multitouch include
// iOS, Android 3.0+, PlayBook, but not WebOS.  Across these devices it therefore tracks SVG support
// accurately - use this test, which might be overly generous on future devices, but works on current devices.



module.exports = require('./track-pointer-events') ? (window.navigator.msMaxTouchPoints && window.navigator.msMaxTouchPoints > 1) :
							(require('./track-touch-events') && document.implementation.hasFeature('http://www.w3.org/TR/SVG11/feature#BasicStructure', '1.1'));
