vue 图片手势放大插件

用法：
npm install dj-pinch --save

import pinch from 'dj-pinch'

Vue.use(pinch)

`<img v-pinch /> 或 <img v-pinch="3" />`
若不传maxScale，则默认为最大倍数2.5倍