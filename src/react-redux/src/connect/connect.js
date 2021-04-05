import connectAdvanced from '../components/connectAdvanced'
import shallowEqual from '../utils/shallowEqual'
import defaultMapDispatchToPropsFactories from './mapDispatchToProps'
import defaultMapStateToPropsFactories from './mapStateToProps'
import defaultMergePropsFactories from './mergeProps'
import defaultSelectorFactory from './selectorFactory'

/*
  connect is a facade over connectAdvanced. It turns its args into a compatible
  selectorFactory, which has the signature:

    (dispatch, options) => (nextState, nextOwnProps) => nextFinalProps

  connect passes its args to connectAdvanced as options, which will in turn pass them to
  selectorFactory each time a Connect component instance is instantiated or hot reloaded.

  selectorFactory returns a final props selector from its mapStateToProps,
  mapStateToPropsFactories, mapDispatchToProps, mapDispatchToPropsFactories, mergeProps,
  mergePropsFactories, and pure args.

  The resulting final props selector is called by the Connect component instance whenever
  it receives new props or store state.
 */

function match(arg, factories, name) {
  for (let i = factories.length - 1; i >= 0; i--) {
    const result = factories[i](arg)
    if (result) return result
  }

  return (dispatch, options) => {
    throw new Error(
      `Invalid value of type ${typeof arg} for ${name} argument when connecting component ${
        options.wrappedComponentName
      }.`
    )
  }
}

function strictEqual(a, b) {
  return a === b
}

// 创建 connect 函数, 这个函数会在这个文件里执行
// 这样做的原因是 可以让某些属性可配置化, 方便自定义和测试
export function createConnect({
  connectHOC = connectAdvanced,
  mapStateToPropsFactories = defaultMapStateToPropsFactories,
  mapDispatchToPropsFactories = defaultMapDispatchToPropsFactories,
  mergePropsFactories = defaultMergePropsFactories,
  selectorFactory = defaultSelectorFactory,
} = {}) {
  // 返回真正的 connect 函数
  return function connect(
    mapStateToProps,
    mapDispatchToProps,
    mergeProps,
    {
      pure = true,
      areStatesEqual = strictEqual,
      areOwnPropsEqual = shallowEqual,
      areStatePropsEqual = shallowEqual,
      areMergedPropsEqual = shallowEqual,
      ...extraOptions
    } = {}
  ) {

    // 判断 mapStateToProps 是否符合已经定义的规则
    // mapStateToPropsFactories 可以想象成你对
    // mapStateToProps 做了一些判断, 只要有一个判断符合了
    // 就可以成功返回值
    // mapStateToPropsFactories 的规则会在 react-redux/src/connect/mapStateToProps.js 里讲解
    // 默认的 defaultMapStateToPropsFactories 有两个规则
    // 1. 如果是函数, 会使用 wrapMapToPropsFunc 包裹, 并且直接return结果
    // 2. 如果没有传值, 则会使用 wrapMapToPropsConstant 包裹
    const initMapStateToProps = match(
      mapStateToProps,
      mapStateToPropsFactories,
      'mapStateToProps'
    )

    // 同上 但是 他的默认规则是 defaultMapDispatchToPropsFactories
    // 在 react-redux/src/connect/mapDispatchToProps.js 此文件中
    const initMapDispatchToProps = match(
      mapDispatchToProps,
      mapDispatchToPropsFactories,
      'mapDispatchToProps'
    )

    // 同上
    const initMergeProps = match(mergeProps, mergePropsFactories, 'mergeProps')

    // 包裹组件的高阶函数 connect(mapStateToProps)(Component)
    return connectHOC(selectorFactory, {
      // 方便 error messages 打印
      methodName: 'connect',

      // 用于从包装的组件的displayName计算Connect的displayName。
      getDisplayName: (name) => `Connect(${name})`,

      // 如果mapStateToProps 为 falsy，则Connect组件不订阅存储状态更改
      shouldHandleStateChanges: Boolean(mapStateToProps),

      //  传递给 selectorFactory 的参数
      initMapStateToProps,
      initMapDispatchToProps,
      initMergeProps,
      pure,
      areStatesEqual,
      areOwnPropsEqual,
      areStatePropsEqual,
      areMergedPropsEqual,

      // any extra options args can override defaults of connect or connectAdvanced
      ...extraOptions,
    })
  }
}

export default /*#__PURE__*/ createConnect()
