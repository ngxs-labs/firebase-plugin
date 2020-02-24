import { Injectable, OnDestroy } from '@angular/core';
import { Store, ActionType, Actions, ofActionDispatched } from '@ngxs/store';
import { tap, take, catchError, mergeMap, takeUntil, finalize, filter, switchMap } from 'rxjs/operators';
import { Subject, Observable, race, Subscription, of } from 'rxjs';
import { NgxsFirestoreState } from './ngxs-firestore.state';
import { attachAction } from '@ngxs-labs/attach-action';
import {
    StreamConnectedOf,
    StreamEmittedOf,
    StreamDisconnectOf,
    StreamDisconnectedOf
} from './action-decorator-helpers';
import { NgxsFirestoreConnectActions } from './ngxs-firestore-connect.actions';

function streamId(action: ActionType, actionCtx: any) {
    return `${action.type}${actionCtx.payload ? ` (${actionCtx.payload})` : ''}`;
}

@Injectable({ providedIn: 'root' })
export class NgxsFirestoreConnect implements OnDestroy {
    firestoreConnectionsSub: Subscription;
    activeFirestoreConnections: string[] = [];

    constructor(private store: Store, private actions: Actions) {}

    connect(
        actionType: ActionType,
        opts: {
            to: (payload: any) => Observable<any>;
            trackBy?: (payload: any) => string;
        }
    ) {
        const actionHandlerSubject = new Subject();
        const actionConnectedHandlerSubject = new Subject();

        attachAction(NgxsFirestoreState, actionType, () => {
            return actionHandlerSubject.asObservable().pipe(
                take(1),
                switchMap((action) => {
                    if (!!this.activeFirestoreConnections.includes(streamId(actionType, action))) {
                        // NGXS doesnt complete the action returning EMPTY
                        return of({});
                    } else {
                        return actionConnectedHandlerSubject.asObservable().pipe(
                            take(1),
                            tap((_) => {
                                // call action stream connected
                                const StreamConnectedClass = StreamConnectedOf(actionType);
                                this.store.dispatch(new StreamConnectedClass(actionType));

                                this.activeFirestoreConnections.push(streamId(actionType, action));

                                // internal stream logging
                                this.store.dispatch(
                                    new NgxsFirestoreConnectActions.StreamConnected(streamId(actionType, action))
                                );
                            })
                        );
                    }
                }),
                catchError((_) => {
                    // NGXS doesnt complete the action returning EMPTY
                    return of({});
                })
            );
        });

        this.firestoreConnectionsSub = this.actions
            .pipe(
                ofActionDispatched(actionType),
                tap((action) => actionHandlerSubject.next(action)),
                filter((actionCtx) => {
                    return !this.activeFirestoreConnections.includes(streamId(actionType, actionCtx));
                }),
                mergeMap((action) => {
                    const streamFn = opts.to;
                    return streamFn(action.payload).pipe(
                        tap((_) => actionConnectedHandlerSubject.next(action)),
                        tap((payload) => {
                            const StreamEmittedClass = StreamEmittedOf(actionType);
                            this.store.dispatch(new StreamEmittedClass(action, payload));
                            this.store.dispatch(
                                new NgxsFirestoreConnectActions.StreamEmitted({
                                    id: streamId(actionType, action),
                                    items: payload
                                })
                            );
                        }),
                        takeUntil(
                            race(
                                this.actions.pipe(ofActionDispatched(StreamDisconnectOf(actionType))),
                                this.actions.pipe(ofActionDispatched(NgxsFirestoreConnectActions.DisconnectAll)),
                                this.actions.pipe(ofActionDispatched(NgxsFirestoreConnectActions.Disconnect)).pipe(
                                    filter((disconnectAction) => {
                                        const { payload } = disconnectAction;
                                        if (!payload) {
                                            return false;
                                        }
                                        const disconnectedStreamId = streamId(
                                            payload.constructor || payload,
                                            disconnectAction.payload
                                        );
                                        if (disconnectedStreamId === streamId(actionType, action)) {
                                            return true;
                                        }

                                        return false;
                                    })
                                )
                            )
                        ),
                        finalize(() => {
                            const StreamDisconnectedClass = StreamDisconnectedOf(actionType);
                            this.store.dispatch(new StreamDisconnectedClass());
                            this.store.dispatch(
                                new NgxsFirestoreConnectActions.StreamDisconnected(streamId(actionType, action))
                            );
                            this.activeFirestoreConnections.splice(
                                this.activeFirestoreConnections.indexOf(streamId(actionType, action)),
                                1
                            );
                        }),
                        catchError((err) => {
                            actionHandlerSubject.error(err);
                            return of({});
                        })
                    );
                })
            )
            .subscribe();
    }

    ngOnDestroy() {
        if (this.firestoreConnectionsSub) {
            this.firestoreConnectionsSub.unsubscribe();
        }
    }
}
