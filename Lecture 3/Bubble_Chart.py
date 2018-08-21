##Scatter Chart와 비슷하지 size로 3번째 변수를 표현할때 사용한다.
##또한 분류위해 색깔로 변수 정보를 표현할 수 있다.

import pandas as pd
import plotly.offline as pyo
import plotly.graph_objs as go

df = pd.read_csv('mpg.csv')

data =[go.Scatter(x=df['horsepower'],
                    y=df['mpg'],
                    text=df['name'], ##hovering over something
                    mode='markers',
                    marker=dict(size=df['weight']/200,
                                color=df['cylinders'],
                                showscale=True))] ##showscale은 색깔범주제공

layout = go.Layout(title='BubbleChart', hovermode='closest')
fig = go.Figure(data=data, layout=layout)
pyo.plot(fig)
