import dash
import dash_core_components as dcc
import dash_html_components as html

app = dash.Dash()       ##dash app 생성

colors = {'background' : '#111111', 'text' : '#7FDBFF'} ##Use as manual

app.layout = html.Div(children=[        ##app layout call
            html.H1('Hello Dash!', style={'textAligh':'center',    ##style에서 HTML styling을 해줌
                                         'color':colors['text']}), ##e.g: textAlign, color ...
            dcc.Graph(id='example',     ##graph object, dcc means core components
                    figure=dict(data=[
                                    {'x':[1,2,3],'y':[4,1,2], 'type':'bar','name':'SF'},
                                    {'x':[1,2,3],'y':[2,4,5], 'type':'bar','name':'NYC'}],
                                    layout={
                                    'plot_bgcolor':colors['background'],
                                    'paper_bgcolor':colors['background'],
                                    'font':{'color':colors['text']},
                                    'title':'BAR PLOTS!'
                                    }))
], style={'backgroundColor':colors['background']}
)

if __name__ == '__main__':
    app.run_server()
