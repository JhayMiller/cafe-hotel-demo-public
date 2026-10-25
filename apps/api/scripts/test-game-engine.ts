import assert from 'node:assert/strict';
import {replayFlight} from '../src/lib/game-engine.js';
import {earnedReward,earnsRecordBonus} from '../src/lib/game-rewards.js';
import {canStartGame,remainingGames} from '../src/lib/game-access.js';

const first=replayFlight(123456,[],3000),second=replayFlight(123456,[],3000);
assert.deepEqual(first,second,'la reconstrucción debe ser determinista');
assert.equal(earnedReward('individual',9,1),null,'no debe premiar menos de 10 puntos');
assert.equal(earnedReward('friends',36,4),null,'el promedio de mesa menor de 10 no debe premiar');
assert.equal(earnedReward('friends',40,4)?.key,'friends-tasting','el promedio de 10 habilita el primer premio de mesa');
assert.equal(earnsRecordBonus(9,12),false,'un récord previo menor de 10 no habilita bono');
assert.equal(earnsRecordBonus(10,11),true,'superar un récord base de 10 habilita bono');
assert.equal(remainingGames(0),3,'un pedido nuevo habilita tres partidas');
assert.equal(remainingGames(2),1,'la tercera partida debe seguir disponible');
assert.equal(canStartGame(3),false,'la cuarta partida debe bloquearse');
console.log('Motor y umbrales del juego verificados.');
