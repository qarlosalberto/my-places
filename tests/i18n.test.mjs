import test from 'node:test';
import assert from 'node:assert/strict';
import {detectLocale,translateFor,locale,t} from '../site/i18n.mjs';

test('Primary browser language decides locale; any Spanish variant uses es-ES',()=>{
 for (const code of ['es','es-ES','es-MX','es-AR','ES-es']) {
  assert.equal(detectLocale([code,'en-US']),'es-ES',code);
 }
 for (const code of ['en','en-US','fr-FR','de-DE','pt-BR','zh-CN']) {
  assert.equal(detectLocale([code,'es-ES']),'en',code);
 }
 assert.equal(detectLocale([], 'es-ES'),'es-ES');
 assert.equal(detectLocale(undefined, 'fr'),'en');
 assert.equal(detectLocale(['en-GB','es-ES']),'en');
});

test('Locale messages, placeholders and regional vocabulary',()=>{
 assert.equal(translateFor('es-ES','◉ Map'),'◉ Mapa');
 assert.equal(translateFor('es-ES','☰ List'),'☰ Lista');
 assert.equal(translateFor('es-ES','Search places...'),'Buscar lugares...');
 assert.equal(translateFor('es-ES','Sign in with Google'),'Iniciar sesión con Google');
 assert.equal(translateFor('es-ES','No places match the current filters.'),'Ningún lugar coincide con los filtros actuales.');
 assert.equal(translateFor('es-ES','{count} places',{count:12}),'12 lugares');
 assert.equal(translateFor('es-ES','Page {page} / {total}',{page:1,total:3}),'Página 1 / 3');
 assert.equal(translateFor('es-ES','Invalid coordinates'),'Coordenadas no válidas');
 assert.equal(translateFor('en','{count} places',{count:3}),'3 places');
 assert.equal(translateFor('en','Search places...'),'Search places...');
 assert.equal(translateFor('en','No group'),'No group');
 assert.equal(locale,'en'); // Node lacks browser language; English is the safe default.
 assert.equal(t('Save place'),'Save place');
});

test('Localized enum labels never change the underlying stored values',()=>{
 for(const [value,expected] of Object.entries({
  Good:'Buena',Medium:'Mediano',Perfect:'Perfecta',Bad:'Mala',
  Large:'Grande',Small:'Pequeño',"Doesn't matter":'Indiferente',
  "Not sure":'No lo sé'
 })) {
  assert.equal(translateFor('es-ES',value),expected);
  assert.equal(translateFor('en',value),value);
 }
 assert.equal(translateFor('es-ES','A user-named map'),'A user-named map');
});
