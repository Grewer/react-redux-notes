import React, { useMemo } from 'react'
import PropTypes from 'prop-types'
import { ReactReduxContext } from './Context'
import Subscription from '../utils/Subscription'
import { useIsomorphicLayoutEffect } from '../utils/useIsomorphicLayoutEffect'



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
