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

#### store.dispatch

```js
  function dispatch(action) {
    // 省略了 action 的 错误抛出
    // 总结:  action  必须是一个 Object  且 action.type 必须有值存在

    // 如果当前正在 isDispatching 则抛出 错误(一般来说不存在

    try {
        isDispatching = true
        // 执行 reducer, 需要注意的是 currentReducer 不能为异步函数
        currentState = currentReducer(currentState, action)
    } finally {
        isDispatching = false
    }

    //  将 nextListeners 赋值给 currentListeners 执行 nextListeners 里面的监听器
    const listeners = (currentListeners = nextListeners)
    for (let i = 0; i < listeners.length; i++) {
        const listener = listeners[i]
        listener()
    }

    // 返回 action
    return action
}
```

#### store.replaceReducer

```js
function replaceReducer(nextReducer) {
    // 如果 nextReducer 不是函数则抛出错误

    // 直接替换
    currentReducer = nextReducer

    // 类似 ActionTypes.INIT.  替换值
    dispatch({type: ActionTypes.REPLACE})
}
```

#### store.observable

还有一个额外的 `observable` 对象:

```js
// 一个 Symbol.observable 的 polyfill
import $$observable from 'symbol-observable'

function observable() {
    // subscribe 就是 store.subscribe
    const outerSubscribe = subscribe
    return {
        subscribe(observer) {
            // 如果 observer 不是对象或者为 null 则抛出错误

            function observeState() {
                if (observer.next) {
                    // next 的入参为 当然 reducer 的值
                    observer.next(getState())
                }
            }

            observeState()

            // 添加了监听
            const unsubscribe = outerSubscribe(observeState)
            return {unsubscribe}
        },

        // 获取到当前 对象, $$observable 值是一个 symbol
        [$$observable]() {
            return this
        }
    }
}
```

这里使用了 `tc39` 里未上线的标准代码 `Symbol.observable`, 如果你使用或者了解过 `rxjs`, 那么这个对于你来说就是很简单的, 如果不熟悉,
可以看看这篇文章: https://juejin.cn/post/6844903714998730766

#### 剩余代码

```js
function createStore() {
    // 省略

    // 初始化了下值
    dispatch({type: ActionTypes.INIT})

    // 返回
    return {
        dispatch,
        subscribe,
        getState,
        replaceReducer,
        [$$observable]: observable
    }
}
```

## combineReducers

### 使用

```js
// 可以接受多个 reducer, 实现一种 module 的功能
rootReducer = combineReducers({potato: potatoReducer, tomato: tomatoReducer})


// 返回值
{
    potato: {
        // 某些属性
    }
,
    tomato: {
        // 某些属性
    }
}


const store = createStore(rootReducer, {
    potato: {
        // 初始值
    }
})
```

有一点需要注意的是, reducer 都是需要默认值的,如:

```js
function counterReducer(state = {value: 0}, action) {
    //...
}
```

### 源码解析

#### combineReducers

先看 `combineReducers` 执行之后产生了什么

```js
function combineReducers(reducers) {
    // 第一步是获取 key, 他是一个数组
    const reducerKeys = Object.keys(reducers)
    const finalReducers = {}

    // 遍历 reducers, 赋值到 finalReducers 中, 确保 reducer 是一个函数, 不是函数则过滤
    for (let i = 0; i < reducerKeys.length; i++) {
        const key = reducerKeys[i]

        // 省略 reducers[key] 如果是 undefined 抛出错误

        if (typeof reducers[key] === 'function') {
            finalReducers[key] = reducers[key]
        }
    }

    // finalReducerKeys 一般来说是和 reducerKeys 相同的
    const finalReducerKeys = Object.keys(finalReducers)

    //定义了两个遍历
    let unexpectedKeyCache
    let shapeAssertionError

    try {
        // 此函数后面会详细讲述
        // 答题作用就是确认 finalReducers 中都是有初始值的
        assertReducerShape(finalReducers)
    } catch (e) {
        shapeAssertionError = e
    }
    //...
}

```

再看他又返回了什么(记住结果必然也是一个 reducer)

```js
function combineReducers(reducers) {

    //...


    return function combination(state = {}, action) {
        // 如果 assertReducerShape 出错则抛出错误
        if (shapeAssertionError) {
            throw shapeAssertionError
        }

        // 忽略非 production 代码

        // 预先定义一些变量
        let hasChanged = false
        const nextState = {}

        // 循环 finalReducerKeys 
        for (let i = 0; i < finalReducerKeys.length; i++) {
            const key = finalReducerKeys[i]
            const reducer = finalReducers[key]

            const previousStateForKey = state[key] // 这是一开始的值
            const nextStateForKey = reducer(previousStateForKey, action) // 通过 reducer 再次生成值

            // 如果 nextStateForKey === undefined 则再次抛出异常

            // 给 nextState 赋值
            nextState[key] = nextStateForKey

            // 判断是否改变 (初始值是 false)  判断简单的使用 !== 来比较
            // 如果已经为 true   就一直为 true 了
            hasChanged = hasChanged || nextStateForKey !== previousStateForKey
        }

        // 循环后再次对 true 做出判断
        // 是否少了 reducer 而造成误判
        hasChanged =
            hasChanged || finalReducerKeys.length !== Object.keys(state).length

        // 如果改变了 返回新值, 否则返回旧值
        return hasChanged ? nextState : state
    }
}
```

`combineReducers` 基本就是上述两个函数的结合, 通过循环遍历所有的 reducer 计算出值

#### assertReducerShape

```js
function assertReducerShape(reducers) {
    Object.keys(reducers).forEach(key => {
        // 遍历参数里的 reducer
        const reducer = reducers[key]

        //执行初始操作 产生初始值都有初始值
        const initialState = reducer(undefined, {type: ActionTypes.INIT})

        //...   如果 initialState 是 undefined 则抛出错误


        // 如果 reducer 执行未知操作  返回的是 undefined 则抛出错误
        // 情景: 当前 reducer 使用了 ActionTypes.INIT 来产生值, 这能够通过上一步
        // 但在这一步就会被检测出来
        if (
            typeof reducer(undefined, {
                type: ActionTypes.PROBE_UNKNOWN_ACTION()
            }) === 'undefined'
        ) {
            //... 抛出错误
        }
    })
}
```

这里我们可以知道一点, 所有 reducer 我们都必须要有一个初始值, 而且他不能是 undefined, 可以是 null

## compose

这里需要先讲 compose 的使用 才能顺带过渡到下面

### 使用

就如他的名字, 是用来组合函数的, 接受刀哥函数, 返回执行的最终函数:

```js
// 这里常用来 链接多个中间件
const store = createStore(
    reducer,
    compose(applyMiddleware(thunk), DevTools.instrument())
)
```

### 源码解析

他的源码也很简单:

```js
function compose(...funcs) {
    if (funcs.length === 0) {
        return arg => arg
    }

    if (funcs.length === 1) {
        return funcs[0]
    }
    // 上面都是 控制, 参数数量为 0 和 1 的情况


    // 这里是重点, 将循环接收到的函数数组
    return funcs.reduce((a, b) => (...args) => a(b(...args)))
}
```

我们将 `reduce` 的运行再度装饰下:

```js
// reduce 中没有初始值的时候, 第一个 `prevValue` 是取  `funcs[0]` 的值

funcs.reduce((prevValue, currentFunc) => (...args) => prevValue(currentFunc(...args)))
```

reducer 返回的就是 这样一个函数 `(...args) => prevValue(currentFunc(...args))`, 一层一层嵌套成一个函数

举一个简单的输入例子:

```js
var foo = compose(val => val + 10, () => 1)
```

foo 打印:

```js
(...args) => a(b(...args))
```

执行 `foo()` , 返回 11

## applyMiddleware

### 使用

`applyMiddleware` 是使用在 `createStore` 中的 `enhancer` 参数来增强 `redux` 的作用

可兼容多种三方插件, 例如 `redux-thunk`, `redux-promise`, `redux-saga` 等等

这里使用官网的一个例子作为展示:

```js

function logger({getState}) {
    // next 就是真正的 store.dispatch
    return next => action => {
        console.log('will dispatch', action)

        const returnValue = next(action)

        console.log('state after dispatch', getState())

        return returnValue
    }
}

const store = createStore(rootReducer, {
    counter: {value: 12345}
}, applyMiddleware(logger))

```

### 源码解析

```js
default

function applyMiddleware(...middlewares) {
    return createStore => (...args) => {
        // 因为使用了 enhancer 参数, 他的内部没有 createStore 的东西, 所以这里需要重新 createStore
        const store = createStore(...args)
        let dispatch = () => {
            // 在中间件中 不允许使用 dispatch
            throw new Error(
                // 省略报错...
            )
        }

        // 这是要传递的参数
        const middlewareAPI = {
            getState: store.getState,
            dispatch: (...args) => dispatch(...args)
        }

        // 重新 map 所有 middlewares 返回需要的结果
        const chain = middlewares.map(middleware => middleware(middlewareAPI))

        // 这里就是我们上面的 compose 相关的代码, 返回的结果 再次执行 得到真正的 dispatch
        dispatch = compose(...chain)(store.dispatch)

        // 返回 store 和 dispatch
        return {
            ...store,
            dispatch
        }
    }
}
```

这里我们需要重新捋一捋函数的执行, 中间件以上述的 `logger` 为例子

`applyMiddleware(logger)` -> 返回的是一个函数`(createStore) => (...args) => {/*省略*/}` 我把他记为中间件函数 1  
也就是说 `applyMiddleware(logger)` === `(createStore) => (...args) => {/*省略*/}`  

这个函数将在 `createStore` 中使用 `enhancer(createStore)(reducer, preloadedState)` 这里的 `enhancer` 就是中间件函数 1
通过 `createStore` 的执行我们可以发现
`store` === `createStore(reducer, preloadedState, enhancer)` === `enhancer(createStore)(reducer, preloadedState)`
=== `applyMiddleware(logger)(createStore)(reducer, preloadedState)` === `((createStore) => (...args) => {/*省略*/})(createStore)(reducer, preloadedState)`
=== 中间件函数 1 中的`{/*省略*/}` 返回结果
通过这一层的推论我们可以得出  `store`  === 中间件函数 1中的 `{/*省略*/}`  返回结果


## bindActionCreators

### 使用

### 源码解析

## 总结

参考文档:

- https://redux.js.org/
- https://github.com/reduxjs/redux
