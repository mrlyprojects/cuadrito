// Shared by the main process and the renderer.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.I18n = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STRINGS = {
    es: {
      five: '5 h',
      week: 'Sem',
      over: 'reinició',
      updatedNow: 'Actualizado ahora',
      updatedAgo: 'Actualizado hace {t}',
      loading: 'Conectando…',
      signedOut: 'Inicia sesión en Claude para ver tu uso.',
      signIn: 'Iniciar sesión',
      offline: 'Sin conexión. Reintentando…',
      rateLimited: 'Claude pidió esperar un poco. Reintentando…',
      blocked: 'claude.ai rechazó la petición. Reintentando…',
      format: 'Claude cambió sus datos de uso. Busca una versión nueva de Cuadrito.',
      resetsOn: 'Se reinicia: {d}',
      glass: 'Cambiar transparencia',
      refresh: 'Actualizar ahora',
      menuRefresh: 'Actualizar ahora',
      menuTransparency: 'Transparencia del cuadro',
      glassSolid: 'Sólido',
      glassSoft: 'Suave',
      glassSemi: 'Semitransparente',
      glassClear: 'Casi invisible',
      menuSize: 'Tamaño del personaje',
      sizeSmall: 'Pequeño',
      sizeMedium: 'Mediano',
      sizeLarge: 'Grande',
      menuActivities: 'Hacer actividades (laptop, pesas, piruetas…)',
      menuWander: 'Pasear por la pantalla',
      menuExpressions: 'Personalizar expresiones…',
      menuAutostart: 'Iniciar con el sistema',
      menuSignIn: 'Iniciar sesión…',
      menuSignOut: 'Cerrar sesión',
      menuQuit: 'Salir de Cuadrito',
      badExpressions: 'expressions.json no es válido ({e}). Usando las expresiones originales.',
    },
    en: {
      five: '5 h',
      week: 'Week',
      over: 'reset',
      updatedNow: 'Updated now',
      updatedAgo: 'Updated {t} ago',
      loading: 'Connecting…',
      signedOut: 'Sign in to Claude to see your usage.',
      signIn: 'Sign in',
      offline: 'Offline. Retrying…',
      rateLimited: 'Claude asked to wait a bit. Retrying…',
      blocked: 'claude.ai refused the request. Retrying…',
      format: 'Claude changed its usage data. Look for a new Cuadrito version.',
      resetsOn: 'Resets: {d}',
      glass: 'Change transparency',
      refresh: 'Refresh now',
      menuRefresh: 'Refresh now',
      menuTransparency: 'Panel transparency',
      glassSolid: 'Solid',
      glassSoft: 'Soft',
      glassSemi: 'Semi-transparent',
      glassClear: 'Nearly invisible',
      menuSize: 'Character size',
      sizeSmall: 'Small',
      sizeMedium: 'Medium',
      sizeLarge: 'Large',
      menuActivities: 'Do activities (laptop, weights, pirouettes…)',
      menuWander: 'Wander around the screen',
      menuExpressions: 'Customize expressions…',
      menuAutostart: 'Start with the system',
      menuSignIn: 'Sign in…',
      menuSignOut: 'Sign out',
      menuQuit: 'Quit Cuadrito',
      badExpressions: 'expressions.json is not valid ({e}). Using the original expressions.',
    },
  };

  function forLocale(locale) {
    const table = String(locale).toLowerCase().startsWith('es') ? STRINGS.es : STRINGS.en;
    return (key, values = {}) =>
      table[key].replace(/\{(\w+)\}/g, (_, name) => values[name]);
  }

  return { forLocale };
});
