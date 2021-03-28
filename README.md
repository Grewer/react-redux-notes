# react-redux 源码阅读笔记

> react-redux 版本号 7.2.3

react-redux 依赖的库:

```
"dependencies": {
    "@babel/runtime": "^7.12.1",
    "@types/react-redux": "^7.1.16",
    "hoist-non-react-statics": "^3.3.2",
    "loose-envify": "^1.4.0",
    "prop-types": "^15.7.2",
    "react-is": "^16.13.1"
}
```

这里我直接把 react-redux 的源码下载了下来,所以这些依赖就必须手动安装了
