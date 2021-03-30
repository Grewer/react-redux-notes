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


我们将 react-redux 分成 3 个模块

1. store 的创建

2. provider 提供数据的注入

3. connect 在想要的组件中使用


## store

关于 store 的创建

可以查看文件: `react-redux/src/components/Provider.js`
```
// 省略文件的引入

// Provider 主体, 是一个组件, 通常在项目的入口使用
function Provider({ store, context, children }) {

  // 创建了一个订阅模式, 值为 store
  // 赋值 onStateChange 为 notifyNestedSubs,  作用 如果 store 值发生了变化 则执行 listener 里的所并回调
  const contextValue = useMemo(() => {
    const subscription = new Subscription(store)
    subscription.onStateChange = subscription.notifyNestedSubs
    return {
      store,
      subscription,
    }
  }, [store])

  // 用来获取store 的值  记录,作为对比
  const previousState = useMemo(() => store.getState(), [store])

  useIsomorphicLayoutEffect(() => {
    const { subscription } = contextValue
    subscription.trySubscribe()

    if (previousState !== store.getState()) {
      subscription.notifyNestedSubs()
    }
    return () => {
      subscription.tryUnsubscribe()
      subscription.onStateChange = null
    }
  }, [contextValue, previousState])

  const Context = context || ReactReduxContext

  return <Context.Provider value={contextValue}>{children}</Context.Provider>
}

if (process.env.NODE_ENV !== 'production') {
  Provider.propTypes = {
    store: PropTypes.shape({
      subscribe: PropTypes.func.isRequired,
      dispatch: PropTypes.func.isRequired,
      getState: PropTypes.func.isRequired,
    }),
    context: PropTypes.object,
    children: PropTypes.any,
  }
}

export default Provider
```




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

简单的来说就是, 此文件中存储了一个变量 batch, 对外输出了 2 个函数,
设置此变量和获取此变量

