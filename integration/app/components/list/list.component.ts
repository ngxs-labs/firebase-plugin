import { Component, OnInit, OnDestroy } from '@angular/core';
import { Store } from '@ngxs/store';
import { RacesActions } from './../../states/races/races.actions';
import { RacesState } from './../../states/races/races.state';
import { Disconnect } from '@ngxs-labs/firestore-plugin';
import { Race } from './../../models/race';
import { Chance } from 'chance';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss']
})
export class ListComponent implements OnInit, OnDestroy {

  public races$ = this.store.select(RacesState.races);
  public bikes$ = this.store.select(RacesState.bikes);

  public total$ = this.races$.pipe(map(races => races.length));

  constructor(
    private store: Store
  ) { }

  ngOnInit() {
    this.store.dispatch(new RacesActions.GetAll());
    setTimeout(() => {
      this.store.dispatch(new Disconnect(RacesActions.GetAll));
    }, 5000);
  }

  create() {
    const chance = new Chance();
    const race: Partial<Race> = {};
    race.id = chance.string({ length: 20 });
    race.name = chance.string();
    race.description = chance.word();
    this.store.dispatch(new RacesActions.Create(race));
  }

  update(race: Race) {
    const chance = new Chance();

    this.store.dispatch(new RacesActions.Update({
      ...race,
      name: chance.string(),
      description: chance.word()
    }));
  }

  delete(id: string) {
    this.store.dispatch(new RacesActions.Delete(id));
  }

  ngOnDestroy() {
    this.store.dispatch(new Disconnect(RacesActions.GetAll));
  }

}