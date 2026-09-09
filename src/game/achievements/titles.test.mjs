import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomLogic } from '../../../server/room_logic.mjs';
import { createRemotes, encodeState, helloFor } from '../net.js';
import { blankCharacter } from '../state.js';
import { achievementState, unlockAchievements, selectAchievementTitle } from './progress.js';
import { titledName, earnedTitleId } from './titles.js';

test('earned titles travel through the real room relay and clear when deselected', () => {
  const character=blankCharacter();character.name='Title test';
  const doc=achievementState(character);doc.metrics.kills=1;unlockAchievements(doc,1);
  assert(selectAchievementTitle(character,'first-blood'));
  const room=createRoomLogic();room.join('one',helloFor(character));
  const joined=room.join('two',{t:'hello',id:'viewer',name:'Viewer'});
  const remotes=createRemotes();remotes.apply(joined.toSelf[0],0);
  const send=()=>{
    const message=encodeState({actor:{character},pos:{x:1,y:0,z:2}});
    const result=room.handle('one',message);
    remotes.apply(result.toOthers[0],1);
    return remotes.all()[0];
  };
  assert.equal(titledName(character.name,send().title),'Title test, The blooded');
  selectAchievementTitle(character,null);
  assert.equal(titledName(character.name,send().title),'Title test');
  doc.title='holding-haven';assert.equal(earnedTitleId(character),null);
  const invalid=room.handle('one',{...encodeState(),title:'<script>bad</script>'}).toOthers[0];
  assert.equal(invalid.title,undefined);
});
