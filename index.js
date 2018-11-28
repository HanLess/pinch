var pinchZoom = require('./lib/pinchZoom')

var pinch = {}

pinch.install = function(Vue){
  Vue.directive('pinch',{
    bind : function(el,binding){
      el.onclick = function(){
        var _src = el.getAttribute("src")
        var img = new Image()
        img.src = _src
        var option = binding.value ? {maxScale : binding.value} : {}

        img.onload = () => {
          var cover = document.createElement("div")
          cover.setAttribute("id",'cover')
          cover.appendChild(img)

          var window_width = window.innerWidth;

          cover.style.cssText = `width:${window_width}px;
          height:100%;
          background-color: #000000;
          position: fixed;
          top:0;
          left:0;
          overflow: auto;
          z-index:999;`

          var _body = document.querySelector("body")
          _body.appendChild(cover)

          // 图片放大
          var pinch = new pinchZoom(img,option)     

          cover.addEventListener("click",(e) => {
            pinch.destroy()
            _body.removeChild(e.currentTarget);
          })
        }
      }
    } 
  })
}
module.exports = pinch