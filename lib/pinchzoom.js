/**
 * PinchZoom: Support pinching and zooming on an element.
 *
 * @codingstandard ftlabs-jsv2
 * @copyright The Financial Times Limited [All rights reserved]
 */

/*jshint node:true*/

'use strict';

module.exports = PinchZoom;
module.exports.PinchZoom = PinchZoom;


/**
 * Master constructor for a pinch/zoom handler on an image.
 * By default, the parent element will be used as the container in which to constrain the image;
 * specify this.containerNode to override this.
 *
 * Images will be initially displayed at to-fit size, using a scale transform for speed.
 *
 * TODO:RB:20111130: While this could be extended to other elements using a 3d transform (scale),
 * rendering within that element would be blurry, so doesn't seem worth implementing at the moment.
 *
 * page to style them...
 */
function PinchZoom(image, options) {

	var defaultConfig = {
            maxScale:           5,
            hardScaleLimit:     true
		},

		Listeners = require('./event-listeners'),

		cssPrefix = require('./vendor-css-prefix');

	// Ensure this is an instantiated object, enabling eg. require('pinchzoom')(image, ...)
	if (!(this instanceof PinchZoom)) return new PinchZoom(image, options);

	if (!(image instanceof HTMLImageElement) || !image.parentNode) {
		throw new TypeError('PinchZoom requires an Image node which is inserted in the DOM');
	}

	this.config = require('./defaults')(defaultConfig, options);
	this.cssTransform                = cssPrefix.transform;
	this.cssTransformOrigin          = this.cssTransform + 'Origin';
	this.cssTransitionProperty       = cssPrefix.transition + 'Property';
	this.cssTransitionTimingFunction = cssPrefix.transition + 'TimingFunction';
	this.cssTransitionDuration       = cssPrefix.transition + 'Duration';
	// 兼容ie
	// this.trackPointerEvents          = require('./track-pointer-events');

	// 是否支持多点触控
	this.multitouchSupport           = require('./multitouch-support');
	if (!this.multitouchSupport) {
		throw new TypeError('do not support multi touch');
	}


	this.image               = image;

	this.imageStyle          = this.image.style;

	this.containerNode       = this.image.parentNode;
	this.listeners           = new Listeners(this.containerNode, this);
	this.documentListeners   = new Listeners(document, this);

	this.fingerCenterX 		 = 0
	this.fingerCenterY 		 = 0
	this.fingerToLeft		 = 0
	this.fingerToTop		 = 0

	this.imageDimensions     = { w: this.image.naturalWidth, h: this.image.naturalHeight };
	this.offset              = { x: 0, y: 0, savedX: 0, savedY: 0 };
	this.roundFactor         = window.devicePixelRatio || 1;

	this.activeInputs        = { length: 0 };	// 屏上的手指数
	this.allowClickEvent     = true;
	this.trackingInput       = false;
	this.capturedInputs      = {};

	this.animationTimeout    = false;
	this.mouseWheelThrottle  = false;

	// Set and reset base styles on the image
	this.imageStyle.position                     = 'absolute';
	this.imageStyle.top                          = 0;
	this.imageStyle.left                         = 0;
	this.imageStyle.height                       = 'auto';
	this.imageStyle.width                        = 'auto';
	this.imageStyle.maxWidth                     = 'none';
	this.imageStyle.maxHeight                    = 'none';

	this.imageStyle[this.cssTransformOrigin]          = '0 0';
	this.imageStyle[this.cssTransitionProperty]       = 'scale, translate';
	this.imageStyle[this.cssTransitionTimingFunction] = 'ease-out';

	this.update();

	this.listeners.bind('touchstart', 'onTouchStart');
	this.listeners.bind('touchmove', 'onTouchMove');
	this.listeners.bind('touchend', 'onTouchEnd');
	this.listeners.bind('touchcancel', 'onTouchCancel');
}


/* TOUCH INPUT HANDLERS */

PinchZoom.prototype.onTouchStart = function(event) {
	var i, l, eachTouch, newIdentifier;
	// Ignore touches past the second
	if (this.activeInputs.length >= 2) {
		return;
	}

	// Record initial event details
	for (i = 0, l = event.targetTouches.length; i < l; i++) {
		eachTouch = event.targetTouches[i];
		if (this.activeInputs.length >= 2 || this.activeInputs[eachTouch.identifier] !== undefined) {
			continue;
		}

		this.activeInputs[eachTouch.identifier] = {
			originX: eachTouch.clientX,
			originY: eachTouch.clientY,
			lastX: false,
			lastY: false,
			time: event.timeStamp
		};
		this.activeInputs.length++;
		newIdentifier = eachTouch.identifier;
	}

	// Process the events as appropriate
	this.processInputStart(newIdentifier);

	event.stopPropagation();
};
PinchZoom.prototype.onTouchMove = function(event) {
	var i, l, eachTouch, trackedTouch;
	if (!this.activeInputs.length) {
		return;
	}

	// Update touch event movements
	for (i = 0, l = event.touches.length; i < l; i++) {
		eachTouch = event.touches[i];
		if (this.activeInputs[eachTouch.identifier] === undefined) {
			continue;
		}

		trackedTouch = this.activeInputs[eachTouch.identifier];
		trackedTouch.lastX = eachTouch.clientX;
		trackedTouch.lastY = eachTouch.clientY;
		trackedTouch.time = event.timeStamp;
	}

	// Trigger an element update in response to the move
	this.processInputMove(event.touches);

	event.preventDefault();
	event.stopPropagation();
};
PinchZoom.prototype.onTouchEnd = function(event) {
	if(event.touches.length == 0){
		this.fingerCenterX = 0
		this.fingerCenterY = 0
		this.fingerToLeft = 0
		this.fingerToTop = 0	
	}
	

	var i, l, eachTouch, touchesDeleted = 0;

	for (i = 0, l = event.changedTouches.length; i < l; i++) {
		eachTouch = event.changedTouches[i];
		if (this.activeInputs[eachTouch.identifier] !== undefined) {
			delete this.activeInputs[eachTouch.identifier];
			this.releaseCapture(eachTouch.identifier);
			touchesDeleted++;
		}
	}
	this.activeInputs.length -= touchesDeleted;

	// If no touches were deleted, no further action required
	if (touchesDeleted === 0) {
		return;
	}

	// Reset the origins of the remaining touches to allow changes to take
	// effect correctly
	for (i in this.activeInputs) {
		if (this.activeInputs.hasOwnProperty(i)) {
			eachTouch = this.activeInputs[i];
			if (typeof eachTouch !== 'object' || eachTouch.lastX === false) {
				continue;
			}
			eachTouch.originX = eachTouch.lastX;
			eachTouch.originY = eachTouch.lastY;
		}
	}

	// If there are no touches remaining, clean up
	if (!this.activeInputs.length) {
		this.processInputEnd();
	}
};
PinchZoom.prototype.onTouchCancel = function() {
	var i;

	if (!this.activeInputs.length) {
		return;
	}

	for (i in this.activeInputs) {
		if (this.activeInputs.hasOwnProperty(i)) {
			if (i === 'length') {
				continue;
			}
			delete this.activeInputs[i];
		}
	}
	this.activeInputs.length = 0;
	this.processInputEnd();
};


// At the end of moves, snap the scale or position back to within bounds if appropriate
PinchZoom.prototype.processInputEnd = function() {
	if (!this.trackingInput) {
		return;
	}

	this.offset.savedX = this.offset.x;
	this.offset.savedY = this.offset.y;
	this.scaleSaved = this.scale;
	this.trackingInput = false;

	// Snap back scale
	var targetScale = Math.max(this.scale, Math.min(1.0, this.containerDimensions.w/this.imageDimensions.w, this.containerDimensions.h/this.imageDimensions.h));
	// if (targetScale > this.config.maxScale) targetScale = this.config.maxScale;

	// Snap back position.
	var pos = {
		imageX: Math.ceil(this.imageDimensions.w * targetScale),
		imageY: Math.ceil(this.imageDimensions.h * targetScale),
		containerX: Math.ceil(this.containerDimensions.w ),
		containerY: Math.ceil(this.containerDimensions.h),
		offsetX: Math.ceil(this.offset.x),
		offsetY: Math.ceil(this.offset.y)
	};
	// If the image is smaller in width than the container, recenter; otherwise, move edges out
	if (pos.imageX <= this.containerDimensions.w) {
		this.offset.x = 0;
	}else if(pos.imageX > pos.containerX && pos.offsetX > 0){
		this.offset.x = 0
	} 
	else if (pos.containerX > pos.offsetX + pos.imageX) {
		this.offset.x = pos.containerX - pos.imageX
	}


	// Do the same for height
	if (pos.imageY <= this.containerDimensions.h) {
		this.offset.y = 0;
	}else if(pos.imageY > pos.containerY && pos.offsetY > 0){
		this.offset.y = 0
	}
	else if (pos.containerY > pos.offsetY + pos.imageY) {
		this.offset.y = pos.containerY - pos.imageY
	}
	// If nothing has changed, no snap required
	if (targetScale === this.scale && this.offset.savedX === this.offset.x && this.offset.savedY === this.offset.y) {
		return;
	}
	this.scaleSaved = this.scale = targetScale;
	this.offset.savedX = this.offset.x;
	this.offset.savedY = this.offset.y;

	this.updatePosition();
	this.releaseAllCapturedInputs();
};








/* POSITIONING */
/* 
	初始化 this.scale 
*/
PinchZoom.prototype.updateDimensions = function() {

	/*
		window.getComputedStyle 获取应用在元素上的 所有 css属性对象，而style只获取标签上style属性的值
		前者只读，后者可读可写
	*/


	var style  = window.getComputedStyle(this.containerNode),
		width  = this.containerNode.offsetWidth,
		height = this.containerNode.offsetHeight,
		tp     = parseInt(style.paddingTop, 10),
		lp     = parseInt(style.paddingLeft, 10),
		bp     = parseInt(style.paddingBottom, 10),
		rp     = parseInt(style.paddingRight, 10),
		tb     = parseInt(style.borderTopWidth, 10),
		lb     = parseInt(style.borderLeftWidth, 10),
		bb     = parseInt(style.borderBottomWidth, 10),
		rb     = parseInt(style.borderRightWidth, 10);

	this.containerDimensions = {
		tp: tp,
		lp: lp,
		bp: bp,
		rp: rp,
		tb: tb,
		lb: lb,
		bb: bb,
		rb: rb,
		w:  width - lp - rp - lb - rb,
		h:  height - tp - bp - tb - bb
	};

	// Set scale to fit
	// this.scale      = Math.min(1.0, this.containerDimensions.w / this.imageDimensions.w, this.containerDimensions.h / this.imageDimensions.h);
	this.scale         = this.containerDimensions.w / this.imageDimensions.w
	this.scaleSaved = this.scale;
};

/*
	根据父元素尺寸，调整图片transform属性，使之大小位置合适
*/
PinchZoom.prototype.initPosition = function(){
	var x, y;
	var left_limit , right_limit , top_limit , bottom_limit

	// Begin with the current offsets
	x = this.offset.x;
	y = this.offset.y;

	// Modify by the original container's padding
	x += this.containerDimensions.lp;
	y += this.containerDimensions.tp;

	if((this.imageDimensions.h * this.scale) > this.containerDimensions.h){
		y = 0
	}else{
		y = (this.containerDimensions.h - (this.imageDimensions.h * this.scale)) / 2;
	}

	if((this.imageDimensions.w * this.scale) > this.containerDimensions.w){
		x = 0
	}else{
		x = (this.containerDimensions.w - (this.imageDimensions.w * this.scale)) / 2;
	}

	x = Math.round(x / this.scale * this.roundFactor) / this.roundFactor;
	y = Math.round(y / this.scale * this.roundFactor) / this.roundFactor;
	// Render
	this.imageStyle[this.cssTransform] = 'scale('+this.scale+') translate3d(' + x + 'px,' + y + 'px,0)';
}



PinchZoom.prototype.updatePosition = function() {

	var x, y;
	var left_limit , right_limit , top_limit , bottom_limit

	// Begin with the current offsets
	x = this.offset.x;
	y = this.offset.y;
	// Modify by the original container's padding
	x += this.containerDimensions.lp;
	y += this.containerDimensions.tp;

	// Modify so that a position of 0,0 will be centered in the container;
	// the CSS style rules will result in a top-left basis for simplicity.

	if(this.containerDimensions.h > (this.imageDimensions.h * this.scale)){
		y += (this.containerDimensions.h - (this.imageDimensions.h * this.scale)) / 2;
	}
	
	if(this.containerDimensions.w > (this.imageDimensions.w * this.scale)){
		x += (this.containerDimensions.w - (this.imageDimensions.w * this.scale)) / 2;
	}
	

	// Amend with the current scale factor and round to nearest pixel
	x = Math.round(x / this.scale * this.roundFactor) / this.roundFactor;
	y = Math.round(y / this.scale * this.roundFactor) / this.roundFactor;
	// Render
	this.imageStyle[this.cssTransform] = 'scale('+this.scale+') translate3d(' + x + 'px,' + y + 'px,0)';
};




/**
 * Process the start of a touch-like input, starting the image move
 * or changing to a zoom/pan as appropriate.
 */
PinchZoom.prototype.processInputStart = function(identifier) {
	var i, eachTouch;

	// Start a move if approprate
	if (!this.trackingInput) {

		this.trackingInput = true;
		this.allowClickEvent = true;
		this.imageStyle[this.cssTransitionDuration] = '0s';

	// For subsequent touches, reset all drag origins to the current position to allow
	// multitouch to alter behaviour correctly
	} else {
		for (i in this.activeInputs) {
			if (this.activeInputs.hasOwnProperty(i)) {
				eachTouch = this.activeInputs[i];
				if (typeof eachTouch !== 'object' || eachTouch.lastX === false) {
					continue;
				}

				eachTouch.originX = eachTouch.lastX;
				eachTouch.originY = eachTouch.lastY;
			}
		}

		this.offset.savedX = this.offset.x;
		this.offset.savedY = this.offset.y;
		this.scaleSaved = this.scale;
	}

	// Capture each input if appropriate
	this.captureInput(identifier);
};

// During movements, update the position according to event position changes, possibly
// including multiple points
PinchZoom.prototype.processInputMove = function(touches) {

	var e1, e2, k;

	if (!this.trackingInput) {
		return;
	}

	// Work out a new image scale if there's multiple touches
	if (this.activeInputs.length === 2) {
		// 计算手指在图片上的位置
		if(this.fingerToLeft == 0 && this.fingerToTop == 0){
			this.fingerCenterX = (touches[0].clientX + touches[1].clientX) / 2
			this.fingerCenterY = (touches[0].clientY + touches[1].clientY) / 2

			if(this.imageDimensions.w * this.scale >= this.containerDimensions.w){
				this.fingerToLeft = (this.fingerCenterX - this.offset.x) / (this.imageDimensions.w * this.scale)
			}else{
				this.fingerToLeft = 0.5
			}
			
			if(this.imageDimensions.h * this.scale >= this.containerDimensions.h){
				this.fingerToTop = (this.fingerCenterY - this.offset.y) / (this.imageDimensions.h * this.scale)
			}else{
				this.fingerToTop = 0.5
			}	
		}
		

		for (k in this.activeInputs) {
			if (this.activeInputs.hasOwnProperty(k)) {
				if (k === 'length') {
					continue;
				}
				if (!e1) {
					e1 = this.activeInputs[k];
				} else {
					e2 = this.activeInputs[k];
				}
			}
		}
		var originalDistance = Math.sqrt(Math.pow(e2.originX - e1.originX, 2) + Math.pow(e2.originY - e1.originY, 2));
		var newDistance = Math.sqrt(Math.pow(e2.lastX - e1.lastX, 2) + Math.pow(e2.lastY - e1.lastY, 2));

		this.scale = this.scaleSaved * (newDistance / originalDistance);
		if (this.config.hardScaleLimit) {
			this.scale = Math.min(this.config.maxScale, this.scale);
		}
	}

	// Work out a new image offset position
	var totalX = 0;
	var totalY = 0;
	for (k in this.activeInputs) {
		if (this.activeInputs.hasOwnProperty(k)) {
			if (k === 'length') {
				continue;
			}
			totalX += this.activeInputs[k].lastX - this.activeInputs[k].originX;
			totalY += this.activeInputs[k].lastY - this.activeInputs[k].originY;
		}
	}
	this.offset.x = this.offset.savedX + (totalX / this.activeInputs.length);
	this.offset.y = this.offset.savedY + (totalY / this.activeInputs.length);

	this.offset.x -= (this.imageDimensions.w * (this.scale - this.scaleSaved)) * this.fingerToLeft
	this.offset.y -= (this.imageDimensions.h * (this.scale - this.scaleSaved)) * this.fingerToTop

	this.updatePosition();
};



PinchZoom.prototype.captureInput = function(identifier) {
	if (identifier === false || this.capturedInputs.identifier) {
		return;
	}

	// Capture pointers on IE 10+
	if (this.trackPointerEvents) {
		this.containerNode.msSetPointerCapture(identifier);
		this.listeners.bind('MSLostPointerCapture', 'onPointerCancel');
	}

	this.capturedInputs[identifier] = true;
};

PinchZoom.prototype.releaseCapture = function(identifier) {
	if (identifier === false || !this.capturedInputs.identifier) {
		return;
	}

	if (this.trackPointerEvents) {
		this.listeners.unbind('MSLostPointerCapture', 'onPointerCancel');
		this.containerNode.msReleasePointerCapture(identifier);
	}

	delete this.capturedInputs[identifier];
};

PinchZoom.prototype.releaseAllCapturedInputs = function() {
	var i;

	for (i in this.capturedInputs) {
		if (this.capturedInputs.hasOwnProperty(i)) {
			this.releaseCapture(i);
			delete this.capturedInputs[i];
		}
	}
};


/**
 *	解绑事件，回归参数
 */
PinchZoom.prototype.destroy = function() {
	this.listeners.unbindAll();
	this.documentListeners.unbindAll();

	this.containerNode     =
	this.image             =
	this.listeners         =
	this.documentListeners = null;
};

// 图片与父元素初始化
PinchZoom.prototype.update = function() {

	if (!this.containerNode) {
		return false;
	}
	this.updateDimensions();
	this.initPosition();
};








