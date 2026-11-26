import test from 'node:test'
import assert from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import { battleMusicIds } from '../packages/cards/battle-music.js'
import { sceneTrack } from '../apps/web/scene-music.js'
import { battleScenery, battleSceneries, sceneryAttributes } from '../apps/web/battle-scenery.js'

test('対戦曲7曲にそれぞれ異なる背景があり、音源と同じID・フォールバックを使う',async()=>{
 assert.deepEqual(Object.keys(battleSceneries),battleMusicIds)
 const artIds=new Set()
 for(const id of [...battleMusicIds,undefined,'unknown','"><script>']) {
  const scene=battleScenery(id)
  assert.equal(scene.id,sceneTrack('battle',id))
  assert.equal(scene.id,sceneTrack('danger',id))
  const attrs=sceneryAttributes(id,key=>'blob:test-'+key,'--ally-light:#fff')
  assert(attrs.includes(`data-bgm-scene="${scene.id}"`))
  assert(attrs.includes(`url('blob:test-${scene.artId}')`),'単体HTML版のBlob画像も利用できる')
  if(battleMusicIds.includes(id)) {
   artIds.add(scene.artId)
   const asset=await stat(new URL('../apps/web/assets/'+scene.artId+'.webp',import.meta.url))
   assert(asset.size>10000&&asset.size<500000,'Web配信向けに背景を圧縮する')
  }
 }
 assert.equal(artIds.size,7)
})
