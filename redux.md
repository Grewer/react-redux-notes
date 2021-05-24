# redux 源码浅析

> redux 版本号:  "redux": "4.0.5"

redux 作为一个十分常用的状态容器库, 大家都应该见识过, 他很小巧, 只有 2kb, 但是珍贵的是他的 `reducer` 和 `dispatch` 这种思想方式

在阅读此文之前, 先了解/使用 redux 相关知识点, 才能更好地阅读本文

## 入口文件

入口是在 `redux/src/index.js` 中, 在入口文件中只做了一件事件, 就是引入文件, 集中导出  
现在我们根据他导出的方法, 来进行分析

## createStore

这个是 redux 最主要的 API

### 使用

搭配这使用方法一起, 可以更好的浏览源码

`createStore(reducer, [preloadedState], [enhancer])`

他的主要功能就是创建一个 store, 将 `reducer` 转换到 `store`

#### 参数

一共可接受三个参数:

1. reducer (函数): 一个返回下一个状态树的还原函数，给定当前状态树和一个要处理的动作。

2. [preloadedState] (任意值): 初始值, 可以是来自于 storage 中的; 如果你用combinedReducers产生了reducer，这必须是一个普通对象，其类型与传递给它的键相同。
   也可以自由地传递任何你的reducer能够理解的东西。

3. [enhancer] (函数): store 的增强器, 可以选择性的增强, 用代码来说就是 `enhancer(createStore)(reducer, preloadedState)`,  `enhancer`
   接受的参数就是 `createStore`, 同样地他也需要 `return` 一个类似于 `createStore` 的结果, 也就是说, 只有我们返回的是 一个像 `createStore` 的东西,
   他的具体实现我们就可以有很多微调 这里附上一篇探讨 `enhancer` 和 `applyMiddleware` 的文章 https://juejin.cn/post/6844903543502012429

```js
// 简单的例子:

function counterReducer(state, action) {
    switch (action.type) {
        case 'counter/incremented':
            return {value: state.value + 1}
        case 'counter/decremented':
            return {value: state.value - 1}
        default:
            return state
    }
}


let store = createStore(counterReducer, {
    value: 12345
})

```

## store

`createStore` 返回的当然是一个 `store`, 他有自己的 `api`

### getState

返回应用程序的当前状态树

```js
const state = store.getState()
```

### dispatch(action)

这个其实不用我多说, 会 `redux` 的都应该知道这个

```js
store.dispatch({type: 'counter/incremented'})
```

### subscribe(listener)

添加一个监听器, 每当 `action` `dispatch` 的时候, 都会调用 `listener`, 在 `listener` 中可以使用 `getState` 来获取当前的状态树

```js
const unsubscribe = store.subscribe(() => {
    console.log('listener run')
    const current = store.getState()
    if (current.value === 12350) {
        unsubscribe()
    }
})
```

展示一个场景, 监听事件, 当达到某个条件之后, 解除监听事件

### replaceReducer(nextReducer)

使用一个 `reducer` 替换当前的 reducer,对于 `reducers` 实现动态加载,也可以为 `Redux` 实现热重载机制

### 源码解析

`createStore` 文件是在 `redux/src/createStore.js` 中, 他接受的参数就是上面我们说的那三个, 返回的也就是 `store`

首先是一段参数的判断, 以及 `enhancer` 的返回

```js
// 为了适配 createStore(reducer, enhancer) 的情况
if (typeof preloadedState === 'function' && typeof enhancer === 'undefined') {
    enhancer = preloadedState
    preloadedState = undefined
}

if (typeof enhancer !== 'undefined') {
    if (typeof enhancer !== 'function') {
        throw new Error('Expected the enhancer to be a function.')
    }
    // enhancer 的使用场景
    return enhancer(createStore)(reducer, preloadedState)
}
```

接下来定义一些变量和函数

```js
let currentReducer = reducer
let currentState = preloadedState
let currentListeners = []
let nextListeners = currentListeners
let isDispatching = false


// 如果相等 , 做了一层浅拷贝  将 currentListeners 同步到 nextListeners 中
// 避免相互影响
function ensureCanMutateNextListeners() {
    if (nextListeners === currentListeners) {
        nextListeners = currentListeners.slice()
    }
}
```

#### store.getState

```js
function getState() {
    // isDispatching 默认为 false, 表示当前 store 是否正在 dispatch
    if (isDispatching) {
        throw new Error('//...')
    }

    // 直接返回当前 state , 默认为入参 preloadedState
    return currentState
}
```

#### store.subscribe

```js
// 忽略了错误判断
function subscribe(listener) {
    let isSubscribed = true

    // 同步 nextListeners , currentListeners
    ensureCanMutateNextListeners()

    // 将 listener 加入 nextListeners 
    nextListeners.push(listener)

    // 返回解除监听函数
    return function unsubscribe() {
        if (!isSubscribed) {
            // 如果 isSubscribed 已经为 false 了 则 return
            // 情况 1, 已经执行过unsubscribe了一次
            return
        }

        // flag
        isSubscribed = false

        // 同步 nextListeners , currentListeners
        ensureCanMutateNextListeners()
        const index = nextListeners.indexOf(listener)
        nextListeners.splice(index, 1)
        // 搜索 监听器, 删除
        currentListeners = null
    }
}
```

## combineReducers

### 使用

### 源码解析

## applyMiddleware

### 使用

### 源码解析

## bindActionCreators

### 使用

### 源码解析

## compose

### 使用

### 源码解析

## 总结

参考文档:

- https://redux.js.org/
- https://github.com/reduxjs/redux
