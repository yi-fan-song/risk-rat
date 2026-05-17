import { del, form, get, post, route } from 'remix/fetch-router/routes'

export const routes = route({
  assets: get('/assets/*path'),

  home: '/',

  auth: route('auth', {
    login: form('login'),
    signup: form('signup'),
    logout: post('logout'),
  }),

  boards: {
    index: get('/boards'),
    new: form('/boards/new'),
    show: get('/boards/:boardId'),
    edit: get('/boards/:boardId/edit'),
    update: post('/boards/:boardId/edit'),
    destroy: del('/boards/:boardId'),
    share: post('/boards/:boardId/share'),
    clue: form('/boards/:boardId/clues/:clueId'),
  },

  share: get('/share/:shareCode'),

  templates: {
    index: get('/templates'),
    show: get('/templates/:boardId'),
    play: post('/templates/:boardId/play'),
  },

  files: {
    show: get('/files/:key'),
  },

  games: {
    create: post('/games'),
    host: get('/games/:joinCode/host'),
    play: get('/games/:joinCode/play'),
    watch: get('/games/:joinCode/watch'),
    join: post('/games/:joinCode/join'),
    action: post('/games/:joinCode/action'),
    events: get('/games/:joinCode/events'),
  },
})
