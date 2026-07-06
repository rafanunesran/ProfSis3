// Polyfill de window.chrome para rodar background.js/content_sed.js/content_profsis.js
// (escritos para uma extensao MV3) dentro de uma WebView Android comum, sem "aba"/
// "background service worker" separado - tudo roda na mesma pagina.
//
// Superficie coberta (a unica usada pelos 3 arquivos da extensao):
//   chrome.storage.local.get/set/remove   -> backend nativo via window.ProfSisNativeStorage
//   chrome.runtime.sendMessage/onMessage  -> pub/sub em memoria (background e content script
//                                            estao no mesmo bundle/realm, entao "enviar mensagem
//                                            para o background" e so chamar os listeners locais)
//   chrome.runtime.getManifest().version  -> window.__PROFSIS_APP_VERSION__ (setado pelo bundler)
//   chrome.tabs.*, chrome.windows.*,
//   chrome.scripting.executeScript       -> stubs; dependem de uma "aba do ProfSis" que nunca
//                                            existe neste app, entao os ramos reais do
//                                            background.js caem sempre no fallback via Firestore
//                                            direto (REST) ja existente no codigo original.
(function () {
  window.chrome = window.chrome || {};
  const chrome = window.chrome;

  // ---------------------------------------------------------------------
  // chrome.storage.local
  // ---------------------------------------------------------------------
  function readNativeStore() {
    const native = window.ProfSisNativeStorage;
    if (!native) return {};
    try {
      return JSON.parse(native.getAll() || "{}");
    } catch (e) {
      console.error("[chrome-shim] falha ao ler storage nativo:", e);
      return {};
    }
  }

  function writeNativeStore(all) {
    const native = window.ProfSisNativeStorage;
    if (!native) return;
    native.setAll(JSON.stringify(all));
  }

  chrome.storage = chrome.storage || {};
  chrome.storage.local = {
    get(keys, callback) {
      const all = readNativeStore();
      let result;
      if (keys === null || keys === undefined) {
        result = all;
      } else if (typeof keys === "string") {
        result = {};
        if (keys in all) result[keys] = all[keys];
      } else if (Array.isArray(keys)) {
        result = {};
        keys.forEach((k) => {
          if (k in all) result[k] = all[k];
        });
      } else if (typeof keys === "object") {
        result = {};
        Object.keys(keys).forEach((k) => {
          result[k] = k in all ? all[k] : keys[k];
        });
      } else {
        result = {};
      }

      if (typeof callback === "function") callback(result);
      return Promise.resolve(result);
    },

    set(items, callback) {
      const all = readNativeStore();
      Object.assign(all, items);
      writeNativeStore(all);
      if (typeof callback === "function") callback();
      return Promise.resolve();
    },

    remove(keys, callback) {
      const all = readNativeStore();
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach((k) => delete all[k]);
      writeNativeStore(all);
      if (typeof callback === "function") callback();
      return Promise.resolve();
    },
  };

  // ---------------------------------------------------------------------
  // chrome.runtime
  // ---------------------------------------------------------------------
  const messageListeners = [];

  chrome.runtime = chrome.runtime || {};
  chrome.runtime.lastError = undefined;

  chrome.runtime.onMessage = {
    addListener(fn) {
      messageListeners.push(fn);
    },
    removeListener(fn) {
      const i = messageListeners.indexOf(fn);
      if (i >= 0) messageListeners.splice(i, 1);
    },
  };

  chrome.runtime.sendMessage = function (message, callback) {
    chrome.runtime.lastError = undefined;

    if (messageListeners.length === 0) {
      chrome.runtime.lastError = {
        message: "Could not establish connection. Receiving end does not exist.",
      };
      if (typeof callback === "function") callback(undefined);
      return;
    }

    let responded = false;
    let keepChannelOpen = false;
    const sendResponse = (response) => {
      if (responded) return;
      responded = true;
      if (typeof callback === "function") callback(response);
    };

    for (const listener of messageListeners) {
      let ret;
      try {
        ret = listener(message, {}, sendResponse);
      } catch (e) {
        console.error("[chrome-shim] listener de onMessage lançou erro:", e);
        continue;
      }
      if (ret === true) keepChannelOpen = true;
      if (responded) break;
    }

    if (!responded && !keepChannelOpen && typeof callback === "function") {
      callback(undefined);
    }
  };

  chrome.runtime.getManifest = function () {
    return { version: window.__PROFSIS_APP_VERSION__ || "0.0.0" };
  };

  // ---------------------------------------------------------------------
  // chrome.tabs / chrome.windows / chrome.scripting
  //
  // Nunca ha uma "aba do ProfSis" de verdade neste app (WebView unica). Os stubs
  // abaixo fazem so o suficiente para os ramos "if (profsisTab) {...}" de
  // background.js nunca serem tomados, caindo sempre no fallback via Firestore
  // direto que ja existe no codigo original.
  // ---------------------------------------------------------------------
  chrome.tabs = chrome.tabs || {};

  chrome.tabs.query = function (_queryInfo, callback) {
    if (typeof callback === "function") callback([]);
  };

  chrome.tabs.create = function (createProps) {
    console.log("[chrome-shim] chrome.tabs.create -> abrindo tela de login do ProfSis nativamente.", createProps);
    if (window.ProfSisNativeNav && typeof window.ProfSisNativeNav.openProfSisLogin === "function") {
      window.ProfSisNativeNav.openProfSisLogin();
    }
  };

  chrome.tabs.update = function (_tabId, _updateProps, callback) {
    if (typeof callback === "function") callback();
  };

  chrome.tabs.sendMessage = function (_tabId, _message, callback) {
    chrome.runtime.lastError = { message: "Nenhuma aba do ProfSis disponível neste app." };
    if (typeof callback === "function") callback(undefined);
  };

  chrome.windows = chrome.windows || {};
  chrome.windows.update = function (_windowId, _updateProps, callback) {
    if (typeof callback === "function") callback();
  };

  chrome.scripting = chrome.scripting || {};
  chrome.scripting.executeScript = function (_details, callback) {
    chrome.runtime.lastError = { message: "chrome.scripting.executeScript não é suportado neste app." };
    if (typeof callback === "function") callback(undefined);
  };
})();
