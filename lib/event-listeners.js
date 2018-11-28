module.exports = Listeners;

function Listeners(el, obj) {
    this.el        = el;
    this.obj       = obj;
    this._bindings = {};
}
Listeners.prototype.bind = function(type, method) {
	this.el.addEventListener(type, this.addBinding(type, method));
};
Listeners.prototype.unbind = function(type, method) {
	this.el.removeEventListener(type, this._bindings[type][method]);
};
Listeners.prototype.addBinding = function(type, method) {
	this._bindings[type] = this._bindings[type] || {};
	this._bindings[type][method] = this.obj[method].bind(this.obj);
	return this._bindings[type][method];
};
Listeners.prototype.unbindAll = function() {
	var type, method;
	for (type in this._bindings) {
		for (method in this._bindings[type]) {
			this.unbind(type, method);
		}
	}
};
