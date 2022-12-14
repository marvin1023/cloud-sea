# CloudSea

CloudSea 是一种封装了一些常见的业务逻辑的请求库，如请求参数与返回数据处理，业务逻辑码（retcode）处理，失败重试，统一成功失败处理等。默认支持小程序与 WEB 请求，可自定义适配器支持更多不同请求。

## 特征

- baseUrl 设置
- 失败后自动 2 次重启
- 业务返回码 retcode 字段指定及白名单处理
- request 请求参数插件处理
- response 返回数据插件处理
- 完成处理（不论成功或失败），见下面的 completeHandler（可在里面进行 hideLoading 处理、上报处理等）
- 成功或失败的统一 promise 链，见下面的 thenHandler 和 catchHandler
- 支持取消发送请求
- 请求适配器自定义
- Typescript 编写
- 其他定制

## 安装

```bash
npm i cloud-sea --save
```

## 使用

### 光速入门

```ts
import { CloudSea } from 'cloud-sea';

const gRequest = new CloudSea();

const requestData = {
  url: 'xxx',
  data: {
    a: 1,
  },
};

// request 调用，如果没有指定 method，则为 GET 请求
gRequest.request(requestData);

// get 调用
gRequest.get(requestData);

// post 调用
gRequest.post(requestData);
```

### 手把手自定义

**1、实例化**

这里实例化的参数分为两类，一类是用于真正请求的，如 header，timeout 等；另一类是用于辅助控制逻辑的，会统一放到 ext 对象中。

```ts
import { CloudSea, ICloudSeaConfig } from 'cloud-sea';

// 在默认配置参数上扩展新的字段 loadingTips，用于控制是否显示 loading
interface IExt extends ICloudSeaConfig {
  loadingTips: boolean;
}

// ICloudSeaOptions 的结构大概是 {..., ext?: {...}}
// 前面三点省略表示请求的一些字段，后面三点表示 config 字段
// 这里 options.ext 里面的配置会覆盖默认的配置
const gRequest = new CloudSea<IExt>({
  ext: {
    loadingTips: false, // 新增的字段
    logicErrorMsgKey: 'msg', // 覆盖默认的字段
  },
});

// 或通过 setConfig 方法修改默认的配置字段
gRequest.setConfig({
  logicErrorMsgKey: 'msg', // 覆盖默认的字段
});

// 如果没有新增字段，则不需要泛型
// const gRequest = new Request({ ext: {logicErrorMsgKey: 'msg'} });

export default gRequest;
```

默认的一些用于辅助控制逻辑的参数，如下（可通过 setConfig 方法或实例化自定义参数覆盖）：

```ts
{
  baseUrl: '',
  xRequestId: true, // header 头部加上 x-request-id，方便打通日志链路，默认开启
  repeatNum: 2, // 默认失败自动重试 2 次
  timeout: 0, // 默认请求本身支持 timeout 参数的不需要这个，设置为 0 即可，如果需要兼容不支持的，设置这个即可，不要设置请求本身的，qq 小程序本身不支持 timeout 设置
  retcodeKey: 'retcode', // retcode 字段，false 表示不启用该功能
  retcodeWhiteList: [], // retcode 白名单，默认空数组为retcode为0进入then，其余为进入catch，false 表示不启用该功能，retcodeKey 为 false 也没有该功能
  logicErrorMsgKey: 'message', // ，默认逻辑错误文本字段，支持一层对象，如 errData.msg
  loginErrorMsgUnknown: 'Unknown Error', // 逻辑错误文本默认，如果后台没有返回具体的错误，则显示该文本
  adapter: getDefaultAdapter(), // 自动适配 WEB 还是小程序发送请求
}
```

**2、插件处理入参与返回**

```ts
// 插件式处理请求参数或返回数据
// ------------------------------------------------
// 处理请求参数
// 可使用多个 use，每个 use 函数按注册顺序依次进入管道处理，所有的入参都挂到 ctx.req 对象上，最后返回 ctx
// 如小程序可再次设置 header 的 cookie 字段，用于鉴权
gRequest.req.use((ctx) => {
  // 处理 req ...
  // ctx.req.xxx = xxx;

  // 最后记得 return ctx
  return ctx;
});

// 处理返回数据，所有的返回都挂到 ctx.res 对象上，同上请求参数的处理
gRequest.res.use((ctx) => {
  // 处理 res ...
  // ctx.res = {};

  // 最后记得 return ctx
  return ctx;
});
```

**3、成功失败的统一处理**

```ts
// 处理请求的成功及失败
// ------------------------------------------------
// 请求完成处理，不论成功或失败，可用于关闭 loading，上报等
// err 有三种 type，分别为：逻辑错误，服务器错误，网络错误，具体见错误说明部分
gRequest.completeHandler = (ctx, err?) => {
  // 成功
  if (!err) {
  }

  // 可以根据 err.type 来判断错误类型
  // ------------------------------------
  // fail
  if (err.type === REQUEST_ERROR_MAP.fail) {
  }

  // server
  if (err.type === REQUEST_ERROR_MAP.server) {
  }

  // logic
  if (err.type === REQUEST_ERROR_MAP.server) {
  }
};

// 统一成功处理
gRequest.thenHandler = (ctx) => {
  // 返回下一步进入成功的数据
  return ctx.res;
};

// 统一错误处理：如 toast 提示，上报错误等
gRequest.catchHandler = (err, ctx) => {
  // 处理逻辑
};
```

**4、函数封装**

```ts
// 常用 get 与 post 方法的进一步封装
// ------------------------------------------------
// 先定义返回的数据格式
export interface IRequestRes<T> {
  retcode: number;
  data: T;
  cost: number;
  message: string;
}
// 简化 get 方法
// 如果实例化有泛型，则这里的 IRequestOptions 也需要 <IExt>，否则不需要
export function gGet<T>(data: IRequestOptions<IExt>) {
  return gRequest.get<IRequestRes<T>>(data);
}

// 简化 post 方法
// 如果实例化有泛型，则这里的 IRequestOptions 也需要 <IExt>，否则不需要
export function gPost<T>(data: IRequestOptions<IExt>) {
  return gRequest.post<IRequestRes<T>>(data);
}
```

**5、具体发送请求**

导入 `gRequest.ts`，调用其方法发送具体请求

```ts
// api.ts
// ------------------------------------
import { IRequestOptions, ICloudSeaConfig } from 'cloud-sea';
import gRequest, { gGet, gPost } from './gRequest';

// 定义返回结构
interface Res<T> {
  retcode: number;
  data: T;
  message?: string;
}

// 常用的请求参数类型如下，具体的话可见类型提示：
// {
//   url: string;
//   method?: IMethod;
//   header?: Record<string, string>;
//   data?: IAnyObject | ...; // 这个有多种值，xhr 这里只做做了 IAnyObject 的特殊处理，其余全部透传
//   timeout?: number; // 注意该 timeout 为默认支持的，如果确认你要兼容的都支持，那么就可以考虑去掉 ext 中的 timeout
//   ext?: {...}; // 上面说的配置
//   task?: { name: string} // 用于取消请求用
// }

//

// 请求 1
interface Data1 {
  isValid: boolean;
}

// 使用 request 方法发送
gRequest.request<Res<Data1>>({
  url: 'xxx',
  method: 'POST',
  header: {
    // 设置 header
    'x-language': 'en', // 设置请求语言
  },
  data: {
    a: 1,
    b: 2,
  },
  // 可覆盖前面的设置
  ext: {
    repeatNum: 0, // 失败不重试
  },
});

// 或直接采用 gPost 方法发送
gPost<Res<Data1>>({
  url: 'xxx',
  header: {
    // 设置 header
    'x-language': 'en', // 设置请求语言
  },
  data: {
    a: 1,
    b: 2,
  },
  // 可覆盖前面的设置
  ext: {
    repeatNum: 0, // 失败不重试
  },
});

// get 请求
interface Data2 {
  name: string;
}
gGet<Res<Data2>>({
  url: 'xxx',
  // 自动拼成 query
  data: {
    a: 1,
    b: 2,
  },
  ext: {
    retcodeKey: 'code', // 这条请求的 retcodeKey 是 code 字段
  },
});

// post 请求
interface Data3 {
  name: string;
  id: string;
}
gPost<Res<Data3>>({
  url: 'xxx',
  data: {
    a: 1,
    b: 2,
  },
  ext: {
    retcodeWhiteList: [3455, 6784], // retcode 为 0， 3455，6784 将会按成功处理，其余按失败处理
  },
});
```

**6、取消正在发送中的请求**

```ts
// 给请求取个名字，注意只有请求有了 name 值才能被取消，否则不能被取消
interface Data3 {
  name: string;
  id: string;
}
gPost<Res<Data3>>({
  url: 'xxx',
  task: {
    name: 'hello',
  },
});

// 取消单个 taskName 为 hello 的请求
gRequest.abort('hello');

// 取消所有有请求名的正在发送中的请求
gRequest.abort();
```

## ctx 参数说明

ctx 由 `req、res、ext` 三大属性组成， 其 TS 类型如下：

PS：注意所有的用于辅助功能的参数都挂到 ext 上，不要随便在 req 上面挂属性。req 会透传到请求适配器，用于发送请求的所有参数。

```ts
export interface ICloudSeaConfig {
  baseUrl: string; // 基础 url，以 https 开头
  repeatNum: number; // 请求失败重试次数
  xRequestId: boolean; // 是否生成请求 id
  timeout: number; // 超时时间，如果确定发请求的 api 本身就支持 timeout 属性，可以设置该值为 0
  retcodeKey: false | string | string[]; // retcode 字段，false 表示不启用该功能
  retcodeWhiteList: false | number[]; // retcode 白名单，默认 0 和 白名单表示业务成功，其余为失败，false 表示不启用该功能。
  logicErrorMsgKey: string; // 业务逻辑错误文本字段
  logicErrorMsgUnknown: string; // 默认的业务逻辑错误文本，如果后台没有返回对应的错误信息，则将使用该信息
  adapter: IAdapter | undefined; // 请求 adapter
}

export interface IRequestTask {
  name?: string; // 用于取消请求
  client: any;
  urlHasNoSearch: string; // 去掉请求 url 的 query，可用于上报请求地址
  timer: ReturnType<typeof setTimeout>;
  costTime: number; // 请求总共花费时间，当 xRequestTime 为 true，则有该值
  repeatTry: () => Promise<IAnyObject>; // 用于重试
}

export interface IRequestCtx<T extends ICloudSeaConfig> {
  req: IReqOptions & { header: Record<string, string> };
  res: IRequestSuccessCallbackResult | Record<string, never>;
  ext: T;
  // ext: U extends Record<string, never> ? ICloudSeaConfig : ICloudSeaConfig & U;
  task: IRequestTask;
}

export type IRequestOptions<T extends Partial<ICloudSeaConfig>> = IReqOptions & {
  ext?: T;
} & { task?: { name: string } };

export type ICloudSeaOptions<T extends Partial<ICloudSeaConfig>> = Omit<IRequestOptions<T>, 'url' | 'data' | 'task'>;
```

## 请求错误说明

```ts
import { REQUEST_ERROR_MAP, RequestError, DEFAULT_LOGIC_ERROR_MSG_UNKNOWN } from 'cloud-sea';

// REQUEST_ERROR_MAP
// {
//   fail: 'REQUEST_ERROR_FAIL', // 直接 fail 的错误
//   server: 'REQUEST_ERROR_SERVER', // 服务端错误，statusCode 小于 200，大于等于 300
//   logic: 'REQUEST_ERROR_LOGIC', // 业务逻辑错误
// }
```

1、第一种错误：根本没有收到服务端返回的信息，这就有了 fail 的错误（以小程序来说，就是 fail 的回调，以 web 来说，就是 XMLHttpRequest 的 onabort, ontimeout, onerror 事件触发），该错误抛出：`new RequestError(err.message || err.errMsg, { type: REQUEST_ERROR_MAP.fail })`。

2、第二种错误：接受到了服务端的信息，但是 statusCode 小于 200，大于等于 300，这就有了 server 错误，该错误抛出： `new RequestError('Request Server Error', { type: REQUEST_ERROR_MAP.server, statusCode });`。

3、第三种错误：虽然 statusCode 大于等于 200，小于 300，但是如果用户没有登录，或身份不对等都无法获取到正确的数据，所以就有了 logic 错误，该错误抛出： `new RequestError(logicErrMsg, { type: REQUEST_ERROR_MAP.logic, retcode });`。`logicErrMsg` 的取值见下面的说明。

这三种抛出的错误默认都会进入到 `catchHandler` 进行处理，如果对 `retcodeWhiteList` 进行设置，则第三种的 logic 错误白名单内的会当做成功进入到 `thenHandler` 处理。

`catchHandler` 和 `completeHandler` 的 err 参数，就是上面的三种错误实例。

### `logicErrMsg`

`logicErrMsg` 是通过调用 `getLogicErrMsg` 方法得到的，逻辑如下：

```ts
getLogicErrMsg(ctx: IRequestCtx): string {
  const { res, ext } = ctx;
  const { logicErrorMsgKey, logicErrorMsgUnknown } = ext;

  // 如果没有指定 msg 的 key
  if (!logicErrorMsgKey) {
    return logicErrorMsgUnknown;
  }

  // 如果有指定，则取该值
  let logicErrMsg: string | undefined = res.data?.[logicErrorMsgKey];
  // 错误信息可能不是一个直接的 string 字段，而是被包裹在一个对象中，如 errData: { text: 'xxx', code: xxx };
  // 这样可以设置 key 值为 'errData.text'，分割得到最终的字段
  if (!logicErrMsg && logicErrorMsgKey.includes('.')) {
    const [key1, key2] = logicErrorMsgKey.split('.');
    if (res.data?.[key1]?.[key2]) {
      logicErrMsg = res.data[key1][key2];
    }
  }

  return logicErrMsg || logicErrorMsgUnknown;
}
```

## 实战

```ts
import { CloudSea, RequestError, ICloudSeaConfig, IRequestOptions } from 'cloud-sea';
// 如为小程序，可直接使用 `wx.showLoading` 与 `wx.showToast` 来实现。
import { showLoading, hideLoading, showToast } from 'x-global-api';
import humps from 'humps';

interface IExt extends ICloudSeaConfig {
  loadingTips: boolean; // 请求发送时 showLoading
  camelCase: boolean; // 失败 showToast
  failToast: boolean; // 转驼峰处理
}

const gRequest = new CloudSea<IExt>({
  ext: {
    baseUrl: 'xxx', // xxx 表示以 https 开头的 url 前缀
    loadingTips: false,
    camelCase: true,
    failToast: true,
  },
});

gRequest.req.use((ctx) => {
  // 默认如果 loadingTips 为 true，则显示 loading
  if (ctx.ext.loadingTips) {
    showLoading({ title: '数据加载中...', mask: true });
  }

  return ctx;
});

gRequest.res.use((ctx) => {
  // 默认如果 camelCase 为 true，则自动进行转驼峰处理
  if (ctx.ext.camelCase) {
    ctx.res.data = humps.camelizeKeys(ctx.res.data);
  }

  return ctx;
});

// 不管成功，失败都要 hideLoading
gRequest.completeHandler = (ctx, err?) => {
  if (ctx.ext.loadingTips) {
    hideLoading();
  }
};

// 统一成功处理
gRequest.thenHandler = (ctx) => {
  // 返回下一步进入成功的数据
  return ctx.res.data;
};

// 失败错误提示
gRequest.catchHandler = (err, ctx) => {
  if (ctx.ext.failToast) {
    const { message, retcode, type, statusCode } = err || {};
    const codeText = retcode ? `(${retcode})` : '';

    if (message) {
      showToast({
        title: type === RequestError.fail ? '请求失败' : `${message}${codeText}`,
        icon: 'none',
      });
    }
  }
};

export function gGet<T>(data: IRequestOptions<Partial<IExt>>) {
  return gRequest.get<IRequestRes<T>>(data);
}

export function gPost<T>(data: IRequestOptions<Partial<IExt>>) {
  return gRequest.post<IRequestRes<T>>(data);
}

export default gRequest;
```

## 注意事项

- 该库 TS 编译的 `target` 为 `ES2015`。如果要兼容到老版本，请再进行一次 babel 编译。
