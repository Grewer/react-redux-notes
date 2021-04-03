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

注意: **关于 hooks 的解析会放到下一文**

### redux

redux 是一个库,但更是一种思想, 而 react-redux 就是一座桥了, 他连接了两中模式, 现在让我们一探究竟

## 分模块

我们将 redux 使用的流程分成 3 个模块

1. store 的创建

2. provider 提供数据的注入

3. connect 在想要的组件中使用

## store

关于 store 的创建

store 使用的主要就是 redux 的 api, 不管 `combineReducers` 还是 `createStore`

关于 redux 的 store  提供了以下 API:

```
export interface Store<S = any, A extends Action = AnyAction> {
   
   // dispatch 的动作
  dispatch: Dispatch<A>
    
  // 返回应用程序的当前状态树。
  getState(): S

   // 添加更改侦听器。每当分派动作时，都会调用它，并且状态树的某些部分可能已更改。然后，您可以调用`getState（）`来读取回调中的当前状态树。
  subscribe(listener: () => void): Unsubscribe

   // 替换 reducer
  replaceReducer(nextReducer: Reducer<S, A>): void
}

```

## provider

可以查看文件: `react-redux/src/components/Provider.js`

```
// 省略文件的引入

// Provider 主体, 是一个组件, 通常在项目的入口使用
function Provider({ store, context, children }) {

  const contextValue = useMemo(() => {
    // 创建了一个订阅模式, 值为 store
    // 赋值 onStateChange 为 notifyNestedSubs,  作用 如果 store 值发生了变化 则执行 listener 里的所并回调
    const subscription = new Subscription(store)
    subscription.onStateChange = subscription.notifyNestedSubs
    return {
      store,
      subscription,
    }
  }, [store])


  // 用来获取store 的值  记录,作为对比
  const previousState = useMemo(() => store.getState(), [store])

  // useIsomorphicLayoutEffect 等于 useLayoutEffect
  useIsomorphicLayoutEffect(() => {
    const { subscription } = contextValue

    // 在 provider 里面 对于 store 添加 onStateChange 回调, 相当于 subscribe 包裹了一层函数, 这一层的作用后面会体现在 connect 中
    // 除了添加回调  还初始化了 listeners subscribe 事件的机制
    subscription.trySubscribe()

    if (previousState !== store.getState()) {
      // 当知青储存的值和当前值不一致时  触发 listeners 里的回调
      subscription.notifyNestedSubs()
    }
    return () => {
      // 解除事件的监听
      subscription.tryUnsubscribe()
      subscription.onStateChange = null
    }
  }, [contextValue, previousState])

  // context, 如果外部提供了 则使用外部的 
  const Context = context || ReactReduxContext

  // 就是 context 的 provider
  return <Context.Provider value={contextValue}>{children}</Context.Provider>
}


// 省略 propTypes

export default Provider
```


## connect
到这里就是真正链接的地方了, 将 redux 的 store 与任意的组件连接

首先查看 connect 的入口文件 `src/connect/connect` :  




## 其他

## 入口文件 src/index.js

```
//...
setBatch(batch)

export {
//...
}
```

基本上都是把 export 的方法引入, 统一再这个文件导出, 但是其中也执行了一个函数: `setBatch(batch)`

#### setBatch

`setBatch` 来源于`./utils/batch` 文件:

```
// Default to a dummy "batch" implementation that just runs the callback
function defaultNoopBatch(callback) {
callback()
}

let batch = defaultNoopBatch

// Allow injecting another batching function later
export const setBatch = (newBatch) => (batch = newBatch)

// Supply a getter just to skip dealing with ESM bindings
export const getBatch = () => batch
```

简单的来说就是, 此文件中存储了一个变量 batch, 对外输出了 2 个函数, 设置此变量和获取此变量

