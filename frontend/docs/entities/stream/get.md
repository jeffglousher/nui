
## GET
Restituisce uno STREAM tramite il suo NAME e CONNECTION


### URL
```
GET /api/connection/:connection_id/stream/:stream_name
```

Use the optional `subject` query parameter to limit the returned subject counts
to one concrete subject. Stream configuration and sequence bounds are unchanged.
- `connection_id`  
  uuid of the CONNECTION that contains the STREAM messages
- `stream_name`
  name of the STREAM to retrieve messages from


### BODY
`null`


### RESPONSE
```
stream_info
```
[STREAM-INFO](./def/stream-info.md)

