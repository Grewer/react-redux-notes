# redux 源码浅析

> redux 版本号:  "redux": "4.0.5"

redux 作为一个十分常用的状态容器库, 大家都应该见识过, 他很小巧, 只有 2kb,
但是珍贵的是他的 `reducer` 和 `dispatch` 这种思想方式  

在阅读此文之前, 先了解/使用 redux 相关知识点, 才能更好地阅读本文 

## 入口文件
入口是在 `redux/src/index.js` 中,
在入口文件中只做了一件事件, 就是引入文件, 集中导出  
现在我们根据他导出的方法, 来进行分析

## createStore
这个是 redux 最主要的 API

### 使用
搭配这使用方法一起, 可以更好的浏览源码

`createStore(reducer, [preloadedState], [enhancer])`

他的主要功能就是创建一个 store, 将 `reducer` 转换到 `store`  
一共可接受三个参数:

1. reducer (Function): 一个返回下一个状态树的还原函数，给定当前状态树和一个要处理的动作。


## combineReducers

### 使用

## applyMiddleware

### 使用

## bindActionCreators
### 使用
## compose

### 使用


## 总结


参考文档:  
- https://redux.js.org/
- https://github.com/reduxjs/redux
